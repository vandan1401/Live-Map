# Contributing

## Database migrations

The SaaS and every private (self-hosted) instance are built from the same
`apps/map/supabase/migrations/`. A schema that differs from git breaks the next update on some
machine, so:

1. **No schema edits from the Supabase dashboard**, on any project. Not even "just a quick index".
2. **Every change is a new migration file**, named `YYYYMMDDHHMMSS_what_it_does.sql`, later than all existing ones.
3. **Never edit an applied migration.** Fix it with a new one.
4. **Forward-only and safe on populated databases.** No dropping data without a backfill; add nullable columns or defaults first, tighten later. Private instances hold real client data that cannot be reset.
5. Verify before merging: `supabase db reset` rebuilds the whole schema from scratch (local only), then the test suite passes.
6. Anything the app relies on must live in a migration, not just in the cloud project: tables, RLS policies, functions, triggers, grants, storage buckets and policies, and the Realtime publication.

## Releases

Private instances only receive tagged versions (`vX.Y.Z`, semver, noted in `CHANGELOG.md`). A tag goes to a client only after the same change has run on the SaaS for a few days.
