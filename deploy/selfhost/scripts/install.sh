#!/usr/bin/env bash
# First-time install on the server (Ubuntu 24.04, Docker already installed). Run as root:
#
#   sudo scripts/install.sh --app-host client.example.com --api-host client-api.example.com \
#                           --ghcr-owner my-github-user --version v1.0.0
#
# Idempotent where it can be: refuses to regenerate secrets if .env exists.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

APP_HOST="" API_HOST="" GHCR_OWNER="" VERSION="" GHCR_USER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --app-host) APP_HOST="$2"; shift 2 ;;
    --api-host) API_HOST="$2"; shift 2 ;;
    --ghcr-owner) GHCR_OWNER="$2"; shift 2 ;;
    --ghcr-user) GHCR_USER="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null && docker compose version >/dev/null || { echo "Docker + the compose plugin are required (README, step 1)" >&2; exit 1; }
systemctl enable --now docker

if [ ! -f .env ]; then
  [ -n "$APP_HOST" ] && [ -n "$API_HOST" ] && [ -n "$GHCR_OWNER" ] && [ -n "$VERSION" ] || {
    echo "first install needs --app-host, --api-host, --ghcr-owner and --version" >&2; exit 2; }
  scripts/gen-secrets.sh --app-host "$APP_HOST" --api-host "$API_HOST" --ghcr-owner "$GHCR_OWNER"
  sed -i "s|^RELEASE_VERSION=.*|RELEASE_VERSION=$VERSION|" .env
else
  echo "install: .env already exists, keeping it"
fi

getenv() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
DATA_DIR=$(getenv DATA_DIR)
OWNER=$(getenv GHCR_OWNER)
mkdir -p "$DATA_DIR/db" "$DATA_DIR/storage" logs

if ! grep -q '"ghcr.io"' /root/.docker/config.json 2>/dev/null; then
  read -rp "GitHub username for the read-only package token [$OWNER]: " GHCR_USER_IN
  read -rsp "Read-only GHCR token (packages: read): " TOKEN; echo
  printf '%s' "$TOKEN" | docker login ghcr.io -u "${GHCR_USER_IN:-${GHCR_USER:-$OWNER}}" --password-stdin
fi

if [ ! -f cloudflared/config.yml ]; then
  echo "install: cloudflared/config.yml is missing. Create the tunnel first (README step 4), then re-run this script."
  exit 1
fi

docker compose pull
docker compose up -d

# Nightly backup at 02:00. The drive must be mounted (backup.sh refuses otherwise).
cat > /etc/cron.d/naksha-backup <<CRON
0 2 * * * root $(pwd)/scripts/backup.sh >> $(pwd)/logs/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/naksha-backup

echo "install: containers started. Next: README step 5 (Tailscale serve) and step 6 (first super admin)."
docker compose ps
