#!/usr/bin/env bash
# Manual, pull-based release update. Run by the operator over Tailscale; never automatic.
#
#   scripts/update.sh v1.4.0
#
# Order: pre-flight -> backup (abort on failure) -> pull images -> migrate -> restart ->
# health check (roll the containers back to the previous tag on failure) -> log.
# Rolling back containers does NOT undo database migrations; see README, "A migration broke
# something", for the manual restore from the backup this script prints.
set -euo pipefail
cd "$(dirname "$0")/.."

NEW=${1:-}
[[ "$NEW" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: $0 vMAJOR.MINOR.PATCH" >&2; exit 2; }

mkdir -p logs
LOG=logs/update.log
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
getenv() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
setenv() { sed -i "s|^$1=.*|$1=$2|" .env; }

PREV=$(getenv RELEASE_VERSION)
DATA_DIR=$(getenv DATA_DIR)
ANON=$(getenv ANON_KEY)
MIN_FREE_GB=${MIN_FREE_GB:-5}
log "update: $PREV -> $NEW"

# 1. pre-flight
free_gb=$(df -BG --output=avail "$DATA_DIR" | tail -1 | tr -dc '0-9')
[ "$free_gb" -ge "$MIN_FREE_GB" ] || { log "ABORT: only ${free_gb}G free on $DATA_DIR (need ${MIN_FREE_GB}G)"; exit 1; }
[ "$(docker compose ps db --format '{{.Health}}')" = "healthy" ] || { log "ABORT: database is not healthy"; exit 1; }

health() { # returns 0 only if app, admin portal and the API answer
  curl -fsS -o /dev/null http://127.0.0.1:8080/ \
    && curl -fsS -o /dev/null http://127.0.0.1:3001/ \
    && curl -fsS -o /dev/null -H "apikey: $ANON" http://127.0.0.1:8000/rest/v1/
}
wait_healthy() { for _ in $(seq 1 30); do health && return 0; sleep 2; done; return 1; }
health || { log "ABORT: the current deployment is not healthy before the update; fix that first"; exit 1; }

# 2. backup (aborts the whole update if it fails)
BACKUP_OUT=$(scripts/backup.sh | tail -1) || { log "ABORT: backup failed, nothing was changed"; exit 1; }
log "backup written: $BACKUP_OUT"

# 3. pull the new images (before changing anything running)
setenv RELEASE_VERSION "$NEW"
if ! docker compose pull app admin migrator; then
  setenv RELEASE_VERSION "$PREV"
  log "ABORT: could not pull $NEW; still running $PREV, nothing changed"
  exit 1
fi
printf '%s\n' "$PREV" > .last_version

rollback() {
  log "ROLLING BACK containers to $PREV"
  setenv RELEASE_VERSION "$PREV"
  docker compose up -d app admin
  if wait_healthy; then
    log "rolled back to $PREV and healthy. Migrations already applied are NOT undone; backup for a manual DB restore: $BACKUP_OUT"
  else
    log "rollback ALSO unhealthy; see README. Backup: $BACKUP_OUT"
  fi
  exit 1
}

# 4. migrate (each migration file is its own transaction, so a failure leaves the database at the last good one)
docker compose run --rm migrator || { log "migration failed"; rollback; }

# 5. restart on the new version
docker compose up -d app admin

# 6. health check
if wait_healthy; then
  log "OK: running $NEW (previous: $PREV, backup: $BACKUP_OUT)"
else
  log "health check failed on $NEW"
  rollback
fi
