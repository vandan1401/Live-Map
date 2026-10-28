---
name: review-live-test-timeouts
description: New live-stack (local Supabase/GoTrue) tests with several network round-trips and no explicit timeout pass in isolation but intermittently hit vitest's 5s default in the full parallel suite — adding a failure the plan's baseline forbids.
metadata:
  type: feedback
---

2026-10-08, plan 36 (selfhost worktree): `admin-portal/adminHttp.test.ts` "deactivates and
reactivates" (4 GoTrue calls, no timeout arg) failed at 5076ms in 1 of 2 full `vitest run`s,
passed 2/2 in isolation. The plan's acceptance criterion was "only the same 5 failures".
Existing `actions.test.ts` already uses `15_000` for the same kind of test.

**Why:** a single isolated run is what the builder usually does; the parallel suite is what
the acceptance criterion names.

**How to apply:** for any new test that hits the local stack more than ~2 times, run the
*full* suite at least twice and look for `5\d\d\dms` on a failure line; recommend an explicit
timeout matching the repo's existing live tests. Related: [[review-vacuous-acceptance-tests]].
