# D-038: Public-link status-visibility toggle is enforced client-side only, not inside get_public_colony()

**Status:** accepted
**Date:** 2026-09-10
**Context:** Owner ask (Tier 3, no plan file — this and D-039 are the only durable record):
a per-colony toggle for whether a public-link visitor sees real plot status at all, or
always sees every plot as "available." Before building, Claude surfaced the real fork —
`get_public_colony()` already hand-picks its column list specifically to keep PII/money
columns from ever reaching an anonymous visitor's browser (docs/plans/22.md/25.md's own
"never `select *`" discipline) — so hiding status only in the client, while the RPC still
returns it, is a real gap from that same standard. Asked the owner directly via
AskUserQuestion rather than picking a default.

## Decision

The toggle (`StatusToggle.tsx`, `applyStatusVisibility()` in `shared/plotStatusVisibility.ts`)
hides status by substituting `"available"` for every plot **in the rendered map only**.
`get_public_colony()`'s SQL is unchanged — it returns each plot's real `status` regardless
of the toggle's position on either surface. A visitor who opens their browser's network tab
during a public-link visit can read the real status even while the map shows "available."

## Why

The owner chose this explicitly, informed of the trade-off, over the server-side
alternative — no independent technical reason drove it; this is a recorded owner
preference, not an engineering constraint. The practical case for it: this app has no
adversarial-visitor threat model today (D-031 — the public link's token *is* the entire
auth boundary, by design, same permissive posture), the family's actual reason for hiding
status is presentational (not confusing a viewer mid-sale-negotiation, not defeating a
technically inclined snooper), and a client-side toggle ships with zero migration risk —
no Tier-1 `/plan`/`/review` gate, no new RPC surface, reusable by the admin map's own
toggle (D-039) with the exact same helper function.

## Rejected alternatives

- **Enforce inside `get_public_colony()`** — the RPC itself would substitute `'available'`
  server-side when a colony's config says the toggle is off entirely, or take a parameter
  and never return real status until a per-visit reveal (which would need its own
  session/cookie mechanism, since the RPC is stateless per call). Rejected for now: real
  security value, but a migration (Tier 1, needs `/plan` + `/review`), and the owner judged
  the presentational use case doesn't warrant it yet.

## Consequences

- If the owner's threat model changes (e.g. a colony's booking status becomes commercially
  sensitive enough that a technical visitor seeing it via network inspection is a real
  problem), enforcing this inside `get_public_colony()` is the correct fix — flagged inline
  in `publicLinkConfig.ts`'s own header comment so a future session doesn't have to
  rediscover this trade-off from scratch.
- `applyStatusVisibility()` and `StatusToggle.tsx` are reused as-is by D-039's admin-map
  toggle; that reuse assumes "hidden" always means the same thing (substitute `"available"`) on
  both surfaces, which only holds because neither is a real security boundary — if one
  becomes one, the shared helper's contract needs re-examining, not just extending.
