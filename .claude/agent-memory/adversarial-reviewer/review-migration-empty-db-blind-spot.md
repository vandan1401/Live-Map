---
name: review-migration-empty-db-blind-spot
description: Recurring defect class — this repo's local gate runs every migration against an EMPTY database, so any migration step that only misbehaves on pre-existing rows ships green and detonates on the production Supabase project.
metadata:
  type: feedback
---

Treat "the local gate is green" as **zero** evidence about a migration's behaviour on
existing data. Structurally, it cannot be evidence here.

**Why:** `make db-reseed` is `supabase db reset` (drops the DB and replays every migration
from scratch) **then** `pnpm import:seed` / `pnpm create-user`. There is no
`apps/map/supabase/seed.sql`. So at the moment any new migration executes, `colonies`,
`plots`, `plot_history` and `auth.users` are all empty. Meanwhile the production Supabase
project holds 5 real accounts and real colonies, and it is the only place the pre-existing-
data path is ever exercised — as a one-shot, owner-confirmed step with no rehearsal.

Failures that are invisible locally by construction:
- `add column … not null` with no default (caught once, plan 03).
- `update`/`delete` on a table with a `before update`/`before delete` trigger —
  `plot_history_no_update` raises unconditionally, so an `update plot_history set …`
  backfill is fine on 0 rows and fatal on N (caught 2026-08-31, plan 21/M16).
- `jsonb ||` on a nullable column (`auth.users.raw_app_meta_data`) — null propagates
  silently, so a backfill "succeeds" while leaving rows unset.
- Unique/check constraints added over data that violates them.
- Anything asserting a row count.

**How to apply:** when reviewing a migration diff, for every table it writes to, ask "what
does this statement do to a row that already exists?" and check (a) that table's triggers,
(b) the nullability of any column being `||`-ed / concatenated / cast, (c) constraints being
tightened. Verify by applying the single file to a *populated* copy —
`docker exec supabase_db_colony-map psql -U postgres -d postgres` inside
`begin; … ; rollback;` — never by reading the gate output. Related:
[[review-vacuous-acceptance-tests]] (recurrences 2 and 11 are this exact shape).
