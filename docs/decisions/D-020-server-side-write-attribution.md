# D-020 — Write attribution is derived server-side from the authenticated session, never a client parameter

**Status:** accepted — supersedes D-016

## Decision

`apply_plot_transition()` no longer accepts an actor/name parameter from the client. It
derives `updated_by`/`changed_by` itself, inside the function body, from
`auth.jwt() -> 'user_metadata' ->> 'display_name'` (falling back to the session's email),
and raises `not authenticated` if `auth.uid()` is null. `plots.updated_by` and
`plot_history.changed_by` stay plain `text` columns — this changes only *where* the
string comes from, not the schema.

## Reasoning

This is the exact end-state D-016 named as its own successor: "Every write carries the
authenticated user id from the session, server-side. Never from a client-supplied field
— that is the difference between attribution and a claim" (`spec/08-map-auth.md`). With
real Supabase Auth sessions now available (D-019), there is no longer a reason to trust a
client-typed string. `plot_history` is the evidence that settles a commission dispute
among five family members (invariant 5) — that evidence is only as good as the identity
behind it, and a client-supplied field is not verifiable identity, only a claim.

## Rejected alternatives

- **Keep `p_actor` but validate it against the session** (e.g. reject if it doesn't match
  `auth.jwt()`'s display name) — rejected as needless complexity; if the server already
  knows the real name from the session, there is nothing for a client parameter to add
  except an opportunity to disagree with the truth.
- **A separate `app_users` table mapping `auth.uid()` to a display name** — rejected;
  GoTrue already embeds `user_metadata` (set once at account creation via
  `scripts/create-user.ts`) directly in the JWT, so a second table would only duplicate
  data `auth.users` already holds, with its own sync-drift risk.

## Blast radius

Contained to `apply_plot_transition()`'s signature (drops `p_actor`, docs/plans/09.md)
and the TypeScript call chain that used to thread `actor` through to the RPC
(`lib/db/plotTransitions.ts`, `lib/plot-status/applyPlotTransition.ts`). UI-facing uses of
an `actor: string` prop (`PlotStatusActions.tsx`'s undo/recently-edited comparisons) are
unchanged in shape — only their source (session-derived via `lib/auth/session.ts`'s
`getDisplayName`, not `localStorage`) changed, exactly as D-016 predicted.
