#!/bin/sh
# Runs at every container start (nginx image runs /docker-entrypoint.d/*.sh): writes
# /config.js from the container's environment so one image serves every deployment.
set -eu
: "${APP_SUPABASE_URL:?APP_SUPABASE_URL is required}"
: "${APP_SUPABASE_ANON_KEY:?APP_SUPABASE_ANON_KEY is required}"
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
cat > /usr/share/nginx/html/config.js <<CFG
window.__APP_CONFIG__ = {
  "supabaseUrl": "$(esc "$APP_SUPABASE_URL")",
  "supabaseAnonKey": "$(esc "$APP_SUPABASE_ANON_KEY")",
  "deploymentMode": "$(esc "${APP_DEPLOYMENT_MODE:-selfhosted}")"
};
CFG
# An empty value would ship a map that cannot reach its backend, with no error anywhere.
grep -q '"supabaseUrl": "[^"]' /usr/share/nginx/html/config.js || {
  echo "app-config: wrote an empty supabaseUrl; refusing to start" >&2
  exit 1
}
