---
name: review-scratch-rows-leak-into-ui
description: Live-integration tests insert permanent scratch rows into the local DB (no DELETE grant); any new list/aggregate UI surface will display them. Check every new query's result set against what tests leave behind.
metadata:
  type: feedback
---

Every live-integration test in `apps/map/src/lib/**` inserts a random-suffixed scratch colony
and never removes it. The M2 migration grants `anon`/`authenticated` only
`select, insert, update` on `colonies`/`plots` — **there is no DELETE grant**, so the rows
survive until the next `supabase db reset`. When a diff adds a query that returns a *set* of
rows (a picker list, a count, a dashboard, an export), ask what the tests have already
deposited into that set.

**Why:** 2026-08-14, plan 06. Every pre-existing scratch colony used `verified: false`
(`applyPlotTransition.test.ts`, `subscribePlots.test.ts`) — accidentally safe. The new
`listColonies.test.ts` / `plotStatus.test.ts` / `plotDetail.test.ts` insert `verified: true`
scratch colonies in the same session that `fetchVerifiedColonies` starts listing every
verified colony on the home screen. Three junk colonies per test run become tappable entries
on the owner's first screen, and tapping one renders the statically-imported `shree-vatika-2`
SVG, so a fake colony looks like a real map. The plan called the residue "harmless" — true
when it was written, false the moment a UI listed it, and nothing in the plan reconciles the
two.

**How to apply:** the fix that fits this schema is not `delete` (not granted) — it is either
leaving the scratch row `verified: false` and flipping it true only for the assertion, or an
`update ... verified = false` teardown. Related: [[review-vacuous-acceptance-tests]] (test
hygiene) and [[review-attribution-fallbacks]] (non-real rows presented as real data).
