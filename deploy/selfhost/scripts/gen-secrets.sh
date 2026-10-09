#!/usr/bin/env bash
# Writes deploy/selfhost/.env from .env.example, generating every secret FRESH.
# Never uses the example values from Supabase's sample .env. Prints no secret.
#
#   scripts/gen-secrets.sh --app-host client.example.com --api-host client-api.example.com \
#                          --ghcr-owner my-github-user [--out .env] [--force]
set -euo pipefail
cd "$(dirname "$0")/.."

APP_HOST="" API_HOST="" GHCR_OWNER="" OUT=".env" FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --app-host) APP_HOST="$2"; shift 2 ;;
    --api-host) API_HOST="$2"; shift 2 ;;
    --ghcr-owner) GHCR_OWNER="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$APP_HOST" ] && [ -n "$API_HOST" ] && [ -n "$GHCR_OWNER" ] || {
  echo "usage: $0 --app-host <host> --api-host <host> --ghcr-owner <owner> [--out .env] [--force]" >&2
  exit 2
}
if [ -e "$OUT" ] && [ "$FORCE" -ne 1 ]; then
  echo "$OUT already exists; refusing to overwrite (regenerating secrets would lock you out of the existing database). Use --force only on a fresh install." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { # jwt <secret> <role>
  local now exp header payload sig
  now=$(date +%s); exp=$((now + 315360000)) # 10 years
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$2" "$now" "$exp" | b64url)
  sig=$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$1" -binary | b64url)
  printf '%s' "$header.$payload.$sig"
}

JWT_SECRET_VALUE=$(openssl rand -hex 32)
declare -A GEN=(
  [POSTGRES_PASSWORD]=$(openssl rand -hex 24)
  [JWT_SECRET]=$JWT_SECRET_VALUE
  [ANON_KEY]=$(jwt "$JWT_SECRET_VALUE" anon)
  [SERVICE_ROLE_KEY]=$(jwt "$JWT_SECRET_VALUE" service_role)
  [DASHBOARD_PASSWORD]=$(openssl rand -hex 16)
  [SECRET_KEY_BASE]=$(openssl rand -base64 48 | tr -d '\n')
  [REALTIME_DB_ENC_KEY]=$(openssl rand -hex 8)   # exactly 16 chars
  [VAULT_ENC_KEY]=$(openssl rand -hex 16)        # exactly 32 chars
  [PG_META_CRYPTO_KEY]=$(openssl rand -hex 24)
  [S3_PROTOCOL_ACCESS_KEY_ID]=$(openssl rand -hex 16)
  [S3_PROTOCOL_ACCESS_KEY_SECRET]=$(openssl rand -hex 32)
)
declare -A SET=(
  [GHCR_OWNER]=$GHCR_OWNER
  [APP_HOST]=$APP_HOST
  [API_HOST]=$API_HOST
  [SUPABASE_PUBLIC_URL]="https://$API_HOST"
  [API_EXTERNAL_URL]="https://$API_HOST/auth/v1"
  [SITE_URL]="https://$APP_HOST"
  [ADDITIONAL_REDIRECT_URLS]="https://$APP_HOST"
)

umask 077
TMP=$(mktemp "${OUT}.XXXXXX")
generated=0
while IFS= read -r line || [ -n "$line" ]; do
  key=${line%%=*}
  if [[ "$line" == *"=__GENERATE__" ]]; then
    printf '%s=%s\n' "$key" "${GEN[$key]}" >> "$TMP"
    generated=$((generated + 1))
  elif [[ "$line" =~ ^[A-Z_]+= && -n "${SET[$key]+x}" ]]; then
    printf '%s=%s\n' "$key" "${SET[$key]}" >> "$TMP"
  else
    printf '%s\n' "$line" >> "$TMP"
  fi
done < .env.example
chmod 600 "$TMP"
mv "$TMP" "$OUT"
echo "Wrote $OUT (mode 600): $generated secrets generated, hostnames set. RELEASE_VERSION is still empty: set it to the version you are installing."
