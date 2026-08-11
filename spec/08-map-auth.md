# M8 — Authentication and RLS lockdown

**Tier 1.** The milestone that makes the app safe to deploy. Until this ships, D-011
stands and the guard hook blocks deploys.

## Goal

Only the five or six family members can open the app. Row-level security enforces it in
the database, not in the client.

## Build

- Supabase Auth with magic links. Six addresses in an allowlist; no passwords, no reset
  flow to build.
- Session duration on the order of 24 hours, not 30 days.
- Replace the permissive RLS policies from M2 with real ones: authenticated users read and
  write plots; `plot_history` is insert-only and never updatable or deletable by anyone.
- Every write carries the authenticated user id from the session, server-side. Never from
  a client-supplied field — that is the difference between attribution and a claim.
- Backfill: seed data imported in M2 has no real user attribution. Decide and record
  whether it is stamped to a system user or left null, and make the UI say which.
- Offline tension (revisit D-008): revoking access stops new fetches but does not reach
  into a phone that already holds cached data. Decide a cache TTL that refuses to render
  data older than a stated age without a successful re-auth, and pin that number.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | An address outside the allowlist cannot get in | Manual, with a real outside address |
| 2 | Anon client reads return zero rows | Real query as anon, output pasted — not the migration file |
| 3 | `plot_history` UPDATE and DELETE are rejected for every role | Real SQL, output pasted |
| 4 | Writes are attributed server-side, ignoring a forged client user id | Test with a tampered payload |
| 5 | Cache TTL forces re-auth after the pinned age | Manual with a clock change |
| 6 | `/review` returns no findings above the correctness bar | Reviewer output |

## After this ships

Remove the deploy block from `.claude/hooks/guard.sh`, update D-011 to `superseded`, and
only then put the app on a real URL.
