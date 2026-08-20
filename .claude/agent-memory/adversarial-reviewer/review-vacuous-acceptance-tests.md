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

**How to apply:** the local Supabase Docker stack is usually up
(`docker exec supabase_db_colony-map psql -U postgres -d postgres -c "..."`). Postgres's
`CONTEXT:` line names the exact failing SQL statement — one command settles it. For a
rollback test to be real, the forcing input must reach *only* the second statement: on this
schema that means `p_note` (goes to `plot_history` alone), never `p_actor` or `p_new_status`
(both are written to `plots` first). Also check the counterpart: a test can only prove
"rolled back" if the first statement actually ran.
