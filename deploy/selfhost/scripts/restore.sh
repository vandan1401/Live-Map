#!/usr/bin/env bash
# Restores a backup set made by backup.sh (a directory containing db.dump and storage.tar.gz).
#
#   scripts/restore.sh /mnt/naksha-backup/daily/20261010-020000
#
# DESTRUCTIVE: replaces the live database and storage. Must run with the SAME .env as the backup
# (the JWT secret and keys are not in the dump; password hashes in auth.users are).
#
# Method (first attempts at restoring a full dump over a running Supabase database failed on its
# own extensions, roles and the realtime schema, so this does what Supabase documents for moving
# a project): build a FRESH stack so the official init scripts, the auth/storage services and our
# migrator create every schema, role and grant exactly as an install would, then load only the
# DATA of the app's schemas (public, auth, storage) into it. The old database and storage
# directories are moved aside, not deleted.
set -euo pipefail
cd "$(dirname "$0")/.."

# The storage files belong to the storage container's user, so extracting them needs root.
[ "$(id -u)" -eq 0 ] || { echo "restore: run with sudo" >&2; exit 1; }
SET=${1:-}
[ -d "$SET" ] && [ -f "$SET/db.dump" ] && [ -f "$SET/storage.tar.gz" ] || {
  echo "usage: $0 <backup-set-dir containing db.dump and storage.tar.gz>" >&2
  exit 2
}
getenv() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
DATA_DIR=$(getenv DATA_DIR)
DB_EXEC="docker compose exec -T db"

echo "This REPLACES the live database and storage with: $SET"
read -rp "Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }

# Everything needed is checked before anything is touched.
docker compose up -d db >/dev/null
$DB_EXEC pg_restore -l < "$SET/db.dump" > /dev/null || { echo "restore: dump is unreadable, aborting before touching anything" >&2; exit 1; }
tar -tzf "$SET/storage.tar.gz" > /dev/null || { echo "restore: storage archive is unreadable, aborting" >&2; exit 1; }

# Data entries of the app's schemas only; the migration bookkeeping tables belong to the fresh stack.
$DB_EXEC pg_restore -l < "$SET/db.dump" \
  | grep -E ' (TABLE DATA|SEQUENCE SET) (public|auth|storage) ' \
  | grep -vE ' (schema_migrations|migrations) ' > "$SET/.restore.list"
[ -s "$SET/.restore.list" ] || { echo "restore: no data entries found in the dump, aborting" >&2; exit 1; }

stamp=$(date +%Y%m%d-%H%M%S)
echo "restore: stopping the stack and moving the old data aside (*.before-restore-$stamp)"
docker compose down
[ ! -d "$DATA_DIR/db" ] || mv "$DATA_DIR/db" "$DATA_DIR/db.before-restore-$stamp"
[ ! -d "$DATA_DIR/storage" ] || mv "$DATA_DIR/storage" "$DATA_DIR/storage.before-restore-$stamp"
mkdir -p "$DATA_DIR/db"

echo "restore: building a fresh stack (init scripts, auth/storage services, migrator)"
docker compose up -d
timeout 600 docker compose wait migrator > /dev/null \
  || { echo "restore: the migrator did not finish cleanly on the fresh database; old data is at $DATA_DIR/*.before-restore-$stamp" >&2; exit 1; }

echo "restore: stopping everything that writes, then loading the data"
docker compose stop app admin cloudflared api-gw studio meta auth rest realtime storage

$DB_EXEC psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare t text;
begin
  for t in select format('%I.%I', schemaname, tablename) from pg_tables
           where schemaname in ('public', 'auth', 'storage')
             and tablename not in ('schema_migrations', 'migrations')
  loop
    execute 'truncate ' || t || ' cascade';
  end loop;
end $$;
SQL

$DB_EXEC sh -c 'cat > /tmp/restore.list' < "$SET/.restore.list"
$DB_EXEC pg_restore -h localhost -U supabase_admin -d postgres \
  --data-only --disable-triggers --exit-on-error -L /tmp/restore.list < "$SET/db.dump" \
  || { echo "restore: loading the data failed; services are still stopped. Old data is at $DATA_DIR/*.before-restore-$stamp" >&2; exit 1; }

echo "restore: restoring storage files"
tar -C "$DATA_DIR" -xzf "$SET/storage.tar.gz"

echo "restore: starting services"
docker compose up -d
echo "restore: done. Previous data kept at: $DATA_DIR/db.before-restore-$stamp and $DATA_DIR/storage.before-restore-$stamp"
