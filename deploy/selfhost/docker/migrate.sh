#!/usr/bin/env bash
# Applies every /migrations/*.sql not yet recorded, in filename order, each in its own
# transaction. Uses the same bookkeeping table as the Supabase CLI (supabase_migrations.
# schema_migrations), so history stays compatible. Forward-only: never edits or re-runs an
# applied migration. Connection comes from the standard PG* environment variables.
# Prints counts and file names only, never data.
set -euo pipefail

for i in $(seq 1 60); do pg_isready -q && break; sleep 2; done
pg_isready -q || { echo "migrate: database not reachable" >&2; exit 1; }

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
SQL

applied=0 skipped=0
for file in $(ls /migrations/*.sql | sort); do
  base=$(basename "$file" .sql)
  version=${base%%_*}
  name=${base#*_}
  if [ "$(psql -tAq -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "migrate: applying $base"
  psql -v ON_ERROR_STOP=1 -q --single-transaction -f "$file" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')"
  applied=$((applied + 1))
done

# D-033: PostgREST caches the schema; tell it to reload after any function/table change.
psql -q -c "notify pgrst, 'reload schema'"
echo "migrate: done, applied=$applied already-applied=$skipped"
