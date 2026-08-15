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

**Recurred 2026-08-16, plan 10** — `lib/colony/bulkImportInitialPlotData.test.ts` created its
scratch colony with `verified: true`, the *only* test file in the repo that does (`rls.test.ts`,
`applyPlotTransition.test.ts`, `subscribePlots.test.ts` all use `false`). 15 rows named
"Bulk import scratch colony" were already sitting in the local DB, +5 per full run, all listed
by `fetchVerifiedColonies`. Also collides with invariant 2 / D-108 ("no code path sets it
true") — a test file *is* a code path. Nothing in the test needed `true`.

**How to apply:** grep every new `insertColony(` in a `*.test.ts` for `verified: true` — the
default must be `false`. The fix that fits this schema is not `delete` (not granted) — it is
either leaving the scratch row `verified: false` and flipping it true only for the assertion,
or an `update ... verified = false` teardown. Verify with
`docker exec supabase_db_colony-map psql -U postgres -d postgres -tAc "select id,name,verified from colonies where verified"`,
not by reading the test. Related: [[review-vacuous-acceptance-tests]] (test hygiene) and
[[review-attribution-fallbacks]] (non-real rows presented as real data).
