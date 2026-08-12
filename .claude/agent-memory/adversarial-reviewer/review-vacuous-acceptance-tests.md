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

**How to apply:** the local Supabase Docker stack is usually up
(`docker exec supabase_db_colony-map psql -U postgres -d postgres -c "..."`). Postgres's
`CONTEXT:` line names the exact failing SQL statement — one command settles it. For a
rollback test to be real, the forcing input must reach *only* the second statement: on this
schema that means `p_note` (goes to `plot_history` alone), never `p_actor` or `p_new_status`
(both are written to `plots` first). Also check the counterpart: a test can only prove
"rolled back" if the first statement actually ran.
