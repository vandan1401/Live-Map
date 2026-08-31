---
name: review-vacuous-acceptance-tests
description: Recurring defect — a "forced failure" / negative test passes for a different reason than the one claimed, and PROGRESS.md's "Verified:" line asserts the stronger claim. Re-run the failing path yourself before accepting it.
metadata:
  type: feedback
---

When a plan's acceptance criterion is proved by a *negative* test (forced failure, rollback,
conflict, constraint violation), do not accept the test's own comment or PROGRESS.md's
"Verified:" line as evidence. Re-run the underlying path and read *which* statement failed.

**Why:** 2026-08-13, M4. `applyPlotTransition.test.ts`'s atomicity test called the RPC with
`p_actor: null`, claiming it "forces `plot_history`'s NOT NULL constraint to fail *after*
the `plots` UPDATE already ran." But `plots.updated_by` is also NOT NULL, so the failure
fired on the `update plots` statement — the history insert never executed. Every assertion
(`error != null`, status unchanged, 0 history rows) passed trivially. The one criterion that
existed to prove cross-statement rollback proved nothing, and PROGRESS.md asserted it did.
Same family as [[review-docs-vs-enforcement-drift]]: prose claims a guarantee the enforcing
layer never exercised.

**2nd recurrence, 2026-08-14 (plan 03).** `PROGRESS.md` claimed `supabase db reset` proved a
migration's defensive `UPDATE ... WHERE status = 'hold'` works "on top of live hold data from
the prior session." `supabase db reset` **drops and recreates** the database and replays every
migration from scratch; there is no `apps/map/supabase/seed.sql`, so `plots` is empty when any
new migration runs. Every "migration is safe against existing data" claim proved by `db reset`
is vacuous by construction, and in that case it hid a hard failure (`ADD COLUMN ... NOT NULL`
with no default aborts on a non-empty table). **Rule: `db reset` can only ever prove a
migration works on an empty DB.** To prove the pre-existing-data path, apply the single
migration file to a populated copy (`docker exec ... psql -f`), or check the assertion by hand
in a transaction with `rollback`.

**3rd recurrence, 2026-08-14 (plan 07, M7).** A different shape: the *runner's exit code*,
not the test body. `pnpm test -- --run` in `apps/map` prints `Tests 66 passed (66)` and
then `Errors 3 errors` / `ELIFECYCLE Test failed` — vitest exits **1** on unhandled errors
outside a test (here undici-vs-jsdom `Event` realm mismatch from supabase realtime's
WebSocket in `ColonyMap.test.tsx`, reproducible on every full run, absent when that file
runs alone). Any criterion worded "the full gate passes" is false on that tree even though
the green summary line reads as success. **Rule: read vitest's exit code and the `Errors`
line, never just `Tests N passed`.** The same run also failed one real test 1 time in ~6 —
run the suite at least twice before calling it green.

**4th recurrence, 2026-08-17 (plan 11).** Every `security definer` RPC here opens with
`if auth.uid() is null then raise exception 'not authenticated'`, so an "anon call is
rejected" test that only asserts `expect(error).not.toBeNull()` passes identically whether
the `revoke execute … from public` landed or not — it cannot prove the criterion it is
cited for ("an anon client gets `42501`"). **Rule: a grant/permission criterion must assert
`error.code`, and a review should confirm the grant out of band
(`select grantee, privilege_type from information_schema.routine_privileges where
routine_name = '…'`) rather than from the test.**

**5th recurrence, 2026-08-20 (plan 12, M11).** Not a negative test this time — a *range*
assertion that the implementation makes unfalsifiable.
`tests/test_geom.py::test_nearest_edge_bearing_in_range` asserts `0 <= bearing < 360`, but
`nearest_edge_bearing` ends in `% 360`, so that holds for every finite input including a
sign-flipped or swapped-argument `atan2`. The plan had singled out this exact function's
convention ("so M12/M13 can combine this with `north_deg` without a sign/direction
mismatch") and it was the one thing untested. **Rule: a test whose assertion is implied by
the last line of the implementation proves nothing — assert the concrete value.** For
bearings on a unit square: `(5,-5)→0`, `(-5,5)→90`, `(5,15)→180`, `(15,5)→270`.

**6th recurrence, 2026-08-20 (plan 13, M12).** A *lookup table* proved by one row.
`classify.py`'s `_KEYWORD_TABLE` has 7 keyword groups; `tests/test_matching.py` asserted
exactly one (`CLUB HOUSE` → `clubhouse`) plus the no-match error. The untested rows hid a
hard bug: the table is an ordered case-insensitive **substring** match with `PARK` listed
before `PARKING`, so `"PARKING"` resolves to `park` and the `parking` kind is unreachable —
while `docs/cad-layer-standard.md` and `contract/colony.schema.json` both promise it.
**Rule: when a constant is a table/enum/map, the test must be parametrised over every row,
and a separate test must assert the table's outputs are a subset of the `contract/` enum it
mirrors. Ordered substring tables also need a prefix-collision check (is any keyword a
substring of a later keyword?).** Related: [[review-docs-vs-enforcement-drift]],
[[review-unpinned-constants]].

**7th recurrence, 2026-08-20 (plan 14, M13).** The criterion's own qualifying clause was
dropped by the test. Criterion 6 read "Two clean runs of `orchestrate_export` … are
byte-identical, **tree positions included**"; `tests/test_export.py::
test_two_clean_runs_are_byte_identical` calls `build_svg(..., trees=(), ...)` and never
calls `orchestrate_export` at all — so the one seeded, non-deterministic-by-default part
of the output is the part excluded. `test_svg_has_zero_styling_attributes` and
`test_manifest_*` also all pass `trees=()`. Same pass: `orchestrate_export` (the Tier-1
entry point, and the only place "both files or neither" lives) had **zero** tests, though
plan §6 named the test explicitly. **Rule: for each acceptance criterion, grep the test
file for the function the criterion names, and re-read the criterion's adverbial clauses
("… included", "… end to end", "… on a re-export") against the arguments actually passed.**

**8th recurrence, 2026-08-21 (plan 16).** A criterion quoting a count that was never
measured: §5 says "`make contract` → **2/2** fixture manifests still validate". There is one
fixture manifest (`fixtures/shree-vatika-2/colony.json`) and the target
(`pytest tests/test_contract.py`) reports **4 passed** since plan 15 added three inline
schema tests. A criterion nobody can match is a criterion that gets silently reinterpreted at
wrap time. **Rule: every numeric expected output in §5 must be re-run before the review ends —
`make contract` here is `cd tools/pipeline && .venv/Scripts/python -m pytest tests/test_contract.py -q`.**

**9th recurrence, 2026-08-24 (plan 19).** Two tests, same body, one docstring claiming a
distinction the test never sets up. `test_svg_labels.py::test_classified_feature_label_is_
also_rendered` says "a label that *did* match a ring now gets its text emitted too", but calls
`build_svg(..., features=[], ..., [reserved_label])` — no ring, no `ClassifiedFeature`,
identical code path to the road-annotation test one function above it. The §5 criterion "a
reserved/other-kind **classified feature** now produces a `<text class="feature-label">`" is
therefore unproven. Same pass: `make golden` is `pytest -k golden`, and
`test_golden.py::test_golden_export_reproduces_shree_vatika_2` is still
`@pytest.mark.skip` — "golden test passed" in `PROGRESS.md` is the *other* `-k golden` match
(`test_geom.py::test_area_sqft_matches_golden_manifest_within_one_percent`). **Rule: when a
test's docstring names a precondition (matched a ring, populated table, existing row), check
that precondition appears in the test *body*; and never accept "golden passed" here without
`pytest -q -k golden` output showing what actually ran.**

**10th recurrence, 2026-08-29 (plan 20).** The *new hook itself* had no test at all — only
the pure function it calls. `view.test.ts` gained three `selectZoomFor` ratio tests, but
`ls apps/map/src/components/map/*.test.ts` shows no `useFlyToSelectedPlot.test.ts`, and
`grep -rl "setView\|SELECT_ZOOM" apps/map/src/**/*.test.*` returns nothing — so §3's
pinned-as-"not optional" clamp (one zoom shared by `project`/`unproject`/`setView`) and both
branches of the null/computed fallback were shipped unexercised. `ColonyMap.test.tsx` passes
`null`/`null` in all three cases, so even the integration path never enters the new branch.
**Rule: when a diff extracts an effect into a new hook file, grep for a test naming that
hook, not just the pure helper it delegates to — pure-function coverage reads as coverage
and is not.**

**How to apply:** the local Supabase Docker stack is usually up
(`docker exec supabase_db_colony-map psql -U postgres -d postgres -c "..."`). Postgres's
`CONTEXT:` line names the exact failing SQL statement — one command settles it. For a
rollback test to be real, the forcing input must reach *only* the second statement: on this
schema that means `p_note` (goes to `plot_history` alone), never `p_actor` or `p_new_status`
(both are written to `plots` first). Also check the counterpart: a test can only prove
"rolled back" if the first statement actually ran.
