# D-031 — Public colony link: token is the auth boundary, hash-fragment routing

**Status:** accepted

## Decision

The public, unauthenticated, per-colony read-only link (docs/plans/22.md, phase 2 of the
multi-tenant SaaS conversion) is built on two choices, both deliberate deviations from this
app's otherwise-universal patterns:

1. **`get_public_colony(p_token uuid)` checks the token only — never `org_id`.** This is the
   one security-definer RPC in the app that must work for a caller with no session and no
   organization membership at all. The random, unguessable `public_token` (a `uuid`, 122
   bits of entropy) *is* the authorization boundary here, in the same role `org_id` plays for
   every other RPC (D-030). The function's SQL carries a `comment on function` stating this,
   so a later session does not "fix" it into an org check that would make every public link
   unreachable.
2. **Routing is a hash fragment (`#/public/<uuid>`), not a path segment.** This app has no
   router — `App.tsx` is one component with a manual state gate — and `wrangler.toml` has no
   `not_found_handling = "single-page-application"` entry, so a path segment
   (`/public/<token>`) would 404 on a direct load against the real Cloudflare deployment. A
   hash fragment is never sent to the server: `/` keeps serving the same `index.html` it
   always has, and `public/sw.js`'s asset caching is untouched. `App.tsx` checks
   `window.location.hash` via `parsePublicToken` before the `session` gate, so a public-link
   visitor never needs to sign in.

The RPC's response is an explicit, hand-written `jsonb_build_object` column list — plot
`svg_id`/`status` and colony `id`/`name`/`svg` only, never `select *`/`to_jsonb(row)` — so
adding a column to `plots` or `colonies` later cannot silently start leaking it through this
path. `found: false` covers a wrong token, a revoked token, and an unverified colony
indistinguishably (deliberate — a distinguishable response would let a caller confirm a
guessed uuid names a real colony without ever seeing its data).

## Reasoning

The owner's original ask (PROGRESS.md, 2026-08-27 exploration) already specified the shape:
"an unauthenticated role scoped by a random unguessable token, reading a restricted surface
that never exposes PII columns — enforced in the database, not filtered at the app layer."
This decision is that ask made concrete against this app's actual schema and deploy setup.

Reusing the RPC-does-its-own-authorization pattern (D-030) rather than inventing a new
mechanism keeps the app's security model in one shape: every write or org/token-scoped read
goes through a `security definer` function that checks its own boundary, never relies on RLS
alone. The one difference — token instead of `org_id` — is the minimum change needed for a
caller who belongs to no organization at all to read anything.

Hash routing over a path segment avoids a deploy-config change (`wrangler.toml`,
Cloudflare's Pages routing) that this plan's remit deliberately excludes — CLAUDE.md already
blocks Claude from running the deploy command itself, and a routing change is exactly the
kind of "affects the live site" edit best kept out of an otherwise self-contained phase.

## Rejected alternatives

- **A restricted Postgres *view*, not a function** — considered (the 2026-08-27 exploration
  notes used the word "view"). Rejected: this repo has no existing read-only-view idiom, and
  a `security definer` function achieves the identical "explicit column list, no PII" guarantee
  while matching every other read/write boundary in the app (all four RPCs now share one
  shape: authorization check, then an explicit column list).
- **Distinguishing "wrong token" from "right token, not verified yet" from "revoked" in the
  response** — rejected as a real information leak, however minor: it would let a caller
  confirm a guessed uuid belongs to a real, existing colony without ever seeing its data.
- **Path-based routing (`/public/<token>`), matching how a "real" public link might look** —
  rejected for now; would need a `wrangler.toml`/Cloudflare routing change this plan does not
  make. Revisit only as an explicit, separately-scoped deploy-config change if ever wanted.

## Scope

`apps/map/supabase/migrations/20260831010000_m17_public_colony_link.sql`,
`apps/map/src/lib/colony/{publicColony,publicLinkUrl}.ts`,
`apps/map/src/features/public-colony/PublicColonyView.tsx`, `apps/map/src/App.tsx`,
`apps/map/scripts/generate-public-link.ts`.
