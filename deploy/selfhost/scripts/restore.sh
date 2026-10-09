#!/usr/bin/env bash
# Restores a backup set made by backup.sh (a directory containing db.dump and storage.tar.gz).
#
#   scripts/restore.sh /mnt/naksha-backup/daily/20261010-020000
#
# DESTRUCTIVE: replaces the live database and storage. Stops everything except the database
# while it works. The current storage directory is moved aside, not deleted.
# NOT YET PROVEN on a second machine: Part F's "backup restore test" is what proves it.
set -euo pipefail
cd "$(dirname "$0")/.."

SET=${1:-}
[ -d "$SET" ] && [ -f "$SET/db.dump" ] && [ -f "$SET/storage.tar.gz" ] || {
  echo "usage: $0 <backup-set-dir containing db.dump and storage.tar.gz>" >&2
  exit 2
}
getenv() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
DATA_DIR=$(getenv DATA_DIR)

echo "This REPLACES the live database and storage with: $SET"
read -rp "Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }

docker compose exec -T db pg_restore -l < "$SET/db.dump" > /dev/null || { echo "restore: dump is unreadable, aborting before touching anything" >&2; exit 1; }

echo "restore: stopping services (database stays up)"
docker compose stop app admin cloudflared api-gw studio meta auth rest realtime storage

echo "restore: restoring database"
docker compose exec -T db pg_restore -h localhost -U supabase_admin -d postgres \
  --clean --if-exists --no-owner --exit-on-error < "$SET/db.dump" \
  || { echo "restore: pg_restore reported errors; services are still stopped. See README, 'Restoring'." >&2; exit 1; }

echo "restore: restoring storage"
aside="$DATA_DIR/storage.before-restore-$(date +%Y%m%d-%H%M%S)"
[ ! -d "$DATA_DIR/storage" ] || mv "$DATA_DIR/storage" "$aside"
tar -C "$DATA_DIR" -xzf "$SET/storage.tar.gz"

echo "restore: starting services"
docker compose up -d
echo "restore: done. Previous storage kept at: ${aside:-none}"
