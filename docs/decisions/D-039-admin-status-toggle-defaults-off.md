# D-039: Admin map's status toggle is always offered (ungated by config) and defaults off

**Status:** accepted
**Date:** 2026-09-10
**Context:** Same session as D-038. The owner asked for the same live status-visibility
toggle (StatusToggle.tsx) on the admin map, not just the public link. Two forks needed the
owner's own call before building, both surfaced via AskUserQuestion rather than assumed:
whether the admin toggle's default state should match the public link's (off) or preserve
today's always-on-immediately behaviour, and whether `config/publicLink.json`'s per-colony
gate should also apply to the admin map.

## Decision

`ColonyMap.tsx` always renders `StatusToggle` in its bottom toolbar — no config entry
decides whether it's offered, unlike the public link (D-038's `publicLinkConfig.ts` gate is
explicitly public-link-only). The toggle **defaults off**: every family member, opening any
colony, now sees every plot as "available" until they tap "Show status." This reverses the
admin map's behaviour on every prior session — status used to be visible immediately on
open, with no way to hide it at all.

## Why

The owner chose default-off explicitly when asked directly whether it should match
today's always-on behaviour instead — this is a recorded preference, not something Claude
inferred from the public-link case defaulting off. Reusing the exact same `StatusToggle`/
`applyStatusVisibility` mechanism on both surfaces (rather than inventing a second
"admin-only, defaults-on" variant) keeps one component and one substitution rule instead of
two subtly different ones — cheaper to build and to reason about later, and the owner's own
answer removed the reason to diverge.

## Rejected alternatives

- **Default on, toggle available only to hide status temporarily (e.g. for a screen-share
  or demo)** — offered to the owner as the recommended option in the AskUserQuestion
  itself, on the reasoning that this app's whole purpose is "a live plot-status map... The
  map's one job is making status readable at a glance" (CLAUDE.md, tier-3.md). Rejected by
  the owner in favour of default-off, uniform with the public link.
- **Config-gate the admin toggle too, per colony** — rejected: family members are trusted,
  unlike an anonymous public-link visitor, so there's no reason a colony would need the
  toggle disabled for its own admins the way a colony might want it disabled for outsiders.

## Consequences

- **This is a real, deliberate regression in the admin map's default legibility**, not an
  overlooked side effect — a family member who hasn't seen this session's work will open a
  colony and see every plot as unbooked, which reads exactly like a bug from the app's
  entire pre-2026-09-10 history. If the owner later reports this as confusing in practice
  (not hypothetically, but from a real family member's reaction), the fix is flipping this
  decision's default, not investigating a regression — check this file first before
  debugging "why does status not show."
- No admin-side config exists to change this default per colony; changing it requires
  either editing `ColonyMap.tsx`'s `useState(false)` directly (affects every colony) or
  building the config-gate D-039 explicitly rejected (new scope, not a bug fix).
