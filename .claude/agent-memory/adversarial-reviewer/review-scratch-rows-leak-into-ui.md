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

**Recurred 2026-08-17, plan 11 (3rd time)** — and now *structurally*, not by choice:
`create_colony_from_manifest()` sets `verified = true` unconditionally (no `p_verified`, by
design — invariant 2), so `lib/colony/createColonyFromManifest.test.ts`'s five live-integration
cases each mint a `verified: true` "Test Upload Colony". Measured: 15 such rows already sat
above `shree-vatika-2` in the local DB, +5 per run, each rendering an empty map from its
`<svg><path id="plot-A-01"/></svg>`. Note the teardown constraint: `plots` cascade-deletes to
`plot_history`, whose BEFORE DELETE trigger raises for **every** role — so `delete` cannot
work even with the service-role key. The only workable teardown is
`serviceRoleClient()` + `update colonies set verified = false` (service_role does hold
`update` on `colonies`, M8 line 149).

**Recurred 2026-08-31, plan 22 (4th time)** — this time not an `insertColony(`: the new
`get_public_colony` case appended to `lib/auth/rls-cross-org.test.ts` does
`admin.from("colonies").update({ verified: true, public_token: token }).eq("id", colonyIdA)`
on a colony `createScratchPlot` deliberately created `verified: false`, and that file's
`afterAll` only deletes scratch users. So **grep `update(` with `verified: true`, not just
inserts.** Same diff's new `publicColony.test.ts` did get the teardown right but swallowed its
error (`createColonyFromManifest.test.ts:70` throws on cleanup failure — copy that).

**5th recurrence, 2026-08-31 (plan 23, admin portal).** A *correct* teardown existed and
still did not cover the new tests: `publicColony.test.ts`'s `afterAll` (unverify +
`public_token: null`) is registered **inside** `describe("get_public_colony — live
integration")` at line 66, and the diff appended a second top-level
`describe("regeneratePublicLink / revokePublicLink")` at line 152 that pushes to the same
`createdColonyIds`. Vitest runs a suite's `afterAll` when *that suite* ends, so the three new
`scratchPublicColony({ verified: true })` colonies are created after cleanup already ran — one
keeps a live `public_token`. **Check the *scope* of the teardown hook, not just its
existence: a new top-level `describe` in a file whose `afterAll` sits inside the old one gets
no cleanup at all.** Fix is one move: hoist the `afterAll` to file scope.

**How to apply:** grep every new `insertColony(` in a `*.test.ts` for `verified: true` — the
default must be `false`. The fix that fits this schema is not `delete` (not granted) — it is
either leaving the scratch row `verified: false` and flipping it true only for the assertion,
or an `update ... verified = false` teardown. Verify with
`docker exec supabase_db_colony-map psql -U postgres -d postgres -tAc "select id,name,verified from colonies where verified"`,
not by reading the test. Related: [[review-vacuous-acceptance-tests]] (test hygiene) and
[[review-attribution-fallbacks]] (non-real rows presented as real data).
