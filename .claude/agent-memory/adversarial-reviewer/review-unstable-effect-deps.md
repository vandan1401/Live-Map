---
name: review-unstable-effect-deps
description: A value built fresh during render (object literal, spread, inline closure) that lands in a mount effect's dependency array tears the Leaflet map down and rebuilds it on every re-render — typecheck and tests stay green. Check identity, not just type, for every new hook arg.
metadata:
  type: feedback
---

For every new argument threaded into `useColonyCanvas` / `usePublicColonyCanvas` (or any
effect dep array), ask **where the value is constructed**. If it is built during render —
`{ ...row, extra: false }`, `arr.map(...)`, an inline arrow — it has a new identity every
render and the effect re-runs every render.

**Why:** both canvas hooks put their whole Leaflet lifecycle in one mount effect whose
cleanup is `map.remove()`. An unstable dep therefore means: destroy the map, rebuild it,
lose pan/zoom/selection — on every state change in the parent (a plot tap, a status toggle,
a splash finishing). Nothing catches it: `tsc` sees a correctly-typed prop, the vitest suites
never assert mount counts, and `.oxlintrc.json` enables only `react/rules-of-hooks` +
`react/only-export-components` — **there is no `react-hooks/exhaustive-deps` and no rule for
unstable references at all.** This project has already paid for it once: `PublicColonyView.tsx`'s
`handleSplashFinish` carries a long comment about a live 2026-09-11 incident where an inline
closure in a child's dep array left the splash mounted forever, blocking every click.

Occurrences:
1. 2026-09-12 (plan 29, backdrop from DB) — `PublicColonyView.tsx:97-99` built
   `colonyBackdropFields = { ...found.colony, backdrop_enabled_on_admin: false }` in the render
   body and passed it to `usePublicColonyCanvas`, whose mount-effect deps the same diff
   extended with it. Fix: `useMemo(..., [found])`. Same diff's admin side
   (`App.tsx:166` → `colonyBackdropFields={selectedColony}`) is stable *per fetch* but newly
   remounts the open map whenever `useColonyList`'s `online`-event refetch replaces the row
   objects — previously the deps were the `colonySvg` **string**, which survived a refetch.
   **Generalisation: replacing a primitive dep (id, string) with the object it came from is a
   silent behaviour change even when the data is identical.**

**How to apply:** on any diff that adds a prop/arg reaching a mount effect, grep the caller
for where that value is created and check for `useMemo`/state/ref. Related:
[[review-contract-widening-consumers]] (same family: the value's *identity* is part of its
contract, not just its shape).
