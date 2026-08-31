# D-030 — Multi-tenant isolation: denormalized `org_id` + RPC-level re-checks, not RLS alone

**Status:** accepted

## Decision

Converting the app from single-tenant to multi-tenant (docs/plans/21.md phase 1, the data
model phase of a three-phase SaaS conversion) uses:

1. A new `organizations` table. Each user belongs to **exactly one** organization,
   recorded as `org_id` in their `auth.users.app_metadata` — the same service-role-only,
   unforgeable-by-the-signed-in-user mechanism D-020 already established for
   `display_name`. No multi-org membership, no org-switcher UI.
2. `org_id uuid not null references organizations(id)` **denormalized** onto `colonies`,
   `plots`, and `plot_history` — not just on `colonies`, joined from there. RLS on `plots`/
   `plot_history` is a flat column comparison against the caller's own `org_id` claim, no
   join required.
3. Every security-definer RPC that looks up a row by a client-supplied id
   (`apply_plot_transition`, `bulk_set_initial_plot_data`, `create_colony_from_manifest`)
   **independently re-checks** that the row's `org_id` matches the caller's own, inside the
   function body — in addition to, not instead of, the RLS policies.

## Reasoning

**Denormalized, not joined:** this project's real scale (PROGRESS.md, 2026-08-27: ≤20
organizations, 1–15 colonies each, 5–10 concurrent viewers) makes a join's query-planning
cost irrelevant either way. A flat column comparison is strictly harder to get wrong in a
Postgres RLS policy expression than a join condition is, and every table gets the same
verification story: "does this row's `org_id` equal the caller's own claim."

**RPC-level re-checks, not RLS alone:** `security definer` functions bypass row-level
security entirely for their own internal queries — RLS is enforced only for a role's
*direct* PostgREST-issued queries. `apply_plot_transition`, `bulk_set_initial_plot_data`,
and `create_colony_from_manifest` all look up a row by a client-supplied id (`p_plot_id`,
`p_colony_id`) and then act on it inside the function body. Without an independent check
inside each function, org isolation would exist only for a client's direct `select`/
`update` calls, while every one of these three write paths would remain a full cross-org
read/write hole reachable by any authenticated user who could guess or already knew
another org's row id. This was confirmed as a real, not theoretical, gap during `/review`
of the implementing diff — none of the three functions had this check in their first draft,
and a live test (two real scratch orgs, `apply_plot_transition` called cross-org) failed
red without it.

**Org-scoped, never client-supplied:** the org id a request acts under is always read from
`auth.jwt()`'s `app_metadata` inside the database, exactly mirroring D-020's attribution
shape. No RPC gained a `p_org_id` parameter, and no TypeScript function signature on the
real app's write path takes an `orgId` argument — only test helpers and admin scripts
(which act via the service-role key, with no session to derive from) do.

## Rejected alternatives

- **RLS alone, trusting every RPC's internal `select` to be re-filtered** — rejected.
  Factually wrong: Postgres RLS does not apply inside a `security definer` function body
  regardless of the calling role, so this would have shipped org isolation that looked
  complete (the direct-query paths are correctly scoped) while leaving every RPC write path
  open. This is exactly the gap `/review` caught.
- **`org_id` on `colonies` only, joined from there for `plots`/`plot_history`'s RLS
  policies** — rejected for this project's scale. A join adds a small, real chance of a
  malformed policy expression (an unqualified column reference, a missed `and`) for no
  measurable performance benefit at ≤20 orgs. Revisit only if the org count or per-org
  colony count grows by an order of magnitude.
- **A client-supplied `org_id` parameter on each write RPC, validated server-side against
  the caller's session** — rejected. Adds an extra validation step for no benefit over
  deriving it directly from the session, and reopens exactly the "attribution is a claim,
  not a fact" failure D-020 already closed for `display_name`.

## Blast radius

Every colony/plot/plot_history row and every account created going forward must carry a
correct `org_id`; a service-role script or admin flow that forgets to set one either fails
loudly (not-null constraint) or, for `auth.users`, silently produces a user who reads zero
rows everywhere (fails closed, not open — safe but confusing without doc). The one-time
migration backfilling existing data into "org #1" is itself high-blast-radius on the
production database (real accounts, real colonies) and is tracked as a distinct, explicit
step requiring the owner's go-ahead, not a default next action.
