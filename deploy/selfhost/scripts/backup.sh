#!/usr/bin/env bash
# Backs up the database (pg_dump, custom format) and the storage volume (tar) to the external
# drive in BACKUP_DIR, then prunes: keeps BACKUP_KEEP_DAILY daily sets (default 14) and
# BACKUP_KEEP_WEEKLY weekly sets (default 8; a Sunday backup is also copied to weekly/).
# Exits non-zero on ANY failure, so update.sh can abort and cron mail/log shows it.
#
# Refuses to write unless BACKUP_DIR is a mount point (so a missing external drive can never
# silently fill the system SSD). Override only for tests: BACKUP_ALLOW_UNMOUNTED=1.
# Prints sizes and paths only, never data.
set -euo pipefail
cd "$(dirname "$0")/.."

getenv() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
BACKUP_DIR=$(getenv BACKUP_DIR)
DATA_DIR=$(getenv DATA_DIR)
KEEP_DAILY=$(getenv BACKUP_KEEP_DAILY); KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=$(getenv BACKUP_KEEP_WEEKLY); KEEP_WEEKLY=${KEEP_WEEKLY:-8}
[ -n "$BACKUP_DIR" ] && [ -n "$DATA_DIR" ] || { echo "backup: BACKUP_DIR/DATA_DIR missing in .env" >&2; exit 1; }

if [ "${BACKUP_ALLOW_UNMOUNTED:-0}" != "1" ] && ! mountpoint -q "$BACKUP_DIR"; then
  echo "backup: $BACKUP_DIR is not a mounted drive; refusing to back up onto the system disk." >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

ts=$(date +%Y%m%d-%H%M%S)
work="$BACKUP_DIR/daily/.tmp-$ts"
final="$BACKUP_DIR/daily/$ts"
mkdir -p "$work"
trap 'rm -rf -- "$work"' EXIT

# supabase_admin is the superuser inside the db container; PGPASSWORD is already set there.
docker compose exec -T db pg_dump -h localhost -U supabase_admin -Fc postgres > "$work/db.dump"
# A dump that cannot be listed is not a backup.
docker compose exec -T db pg_restore -l < "$work/db.dump" > /dev/null

tar -C "$DATA_DIR" -czf "$work/storage.tar.gz" storage
tar -tzf "$work/storage.tar.gz" > /dev/null

mv "$work" "$final"
trap - EXIT
echo "backup: wrote $final (db $(du -h "$final/db.dump" | cut -f1), storage $(du -h "$final/storage.tar.gz" | cut -f1))"

if [ "$(date +%u)" = "7" ]; then
  cp -r "$final" "$BACKUP_DIR/weekly/$ts"
  echo "backup: Sunday, also kept as weekly/$ts"
fi

prune() { # prune <dir> <keep>
  local dir=$1 keep=$2
  local old
  old=$(find "$dir" -mindepth 1 -maxdepth 1 -type d -name '2*' | sort | head -n -"$keep" || true)
  [ -z "$old" ] || printf '%s\n' "$old" | while IFS= read -r d; do rm -rf -- "$d"; done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
echo "$final"
