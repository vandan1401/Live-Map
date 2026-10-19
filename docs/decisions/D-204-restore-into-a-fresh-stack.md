# D-204: Restore into a fresh stack, data only

**Status:** accepted (2026-10-20, proven once on the mini PC; not yet on a second machine)

## Decision
`deploy/selfhost/scripts/restore.sh` moves the old db/storage directories aside, brings up a fresh
stack (Supabase init scripts, auth/storage services, our migrator create every schema, role and
grant), stops the writers, truncates and then loads only the DATA entries of `public`, `auth` and
`storage` (`pg_restore --data-only --disable-triggers`, migration bookkeeping tables skipped), then
extracts the storage archive. Needs root and the same `.env`.

## Why
The first real restore test failed three ways when restoring a full dump over the live database:
Supabase's `realtime` schema cannot be dropped while its service owns it; `--no-owner` left
auth/storage tables owned by `supabase_admin`, so those services crash-looped; and extension-owned
objects (graphql) failed on their grants. Moving a Supabase project by loading data into a fresh
instance is also what Supabase documents.

## Rejected
- `pg_restore --clean` over the live database (with and without `--no-owner`, with the realtime
  schema excluded): fails or leaves services unable to start.
- Physical backup of the Postgres data directory: robust but not portable across versions, and needs the db stopped.
