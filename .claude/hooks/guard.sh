#!/bin/bash
# Deterministic guardrail. CLAUDE.md is advisory; this is enforcement.
# A PreToolUse hook returning exit 2 blocks the call in EVERY permission mode,
# including bypassPermissions. Safety-critical rules belong here, not in prose.

. "$(dirname "$0")/_json.sh"

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jget .tool_input.command)
[ -z "$CMD" ] && exit 0

block() { echo "Blocked: $1" >&2; exit 2; }

# Long-running servers are mine. Claude never starts them.
echo "$CMD" | grep -qE '(npm|pnpm|yarn|bun) run dev' && block "I run the dev server in a separate terminal."
echo "$CMD" | grep -qE 'next dev|vite( |$)|nodemon'   && block "I run the dev server in a separate terminal."
echo "$CMD" | grep -qE 'python3? -m http\.server|make serve' && block "I serve the verify page in a separate terminal."

# Irreversible.
echo "$CMD" | grep -qE 'rm +-[a-zA-Z]*[rf]'      && block "recursive/forced delete. Do it yourself if you mean it."
echo "$CMD" | grep -qE 'git +push.*--force'      && block "force push."
echo "$CMD" | grep -qE 'git +reset +--hard'      && block "hard reset. Use /rewind or do it yourself."
echo "$CMD" | grep -qiE 'drop +(table|database)' && block "destructive SQL."

# apps/map — no auth until M8 (D-011). A URL leak exposes ownership records.
echo "$CMD" | grep -qE 'wrangler pages deploy|wrangler deploy' && block "deploys are manual — and there is no auth until M8 (D-011). Never deploy this publicly."
echo "$CMD" | grep -qE 'supabase db reset|supabase db push'    && block "migrations and resets are mine to run. See D-011."

# tools/pipeline — hand-verified corrections and the local-only rule.
echo "$CMD" | grep -qE 'rm .*(overrides|out/|verified)' && block "that path holds hand-verified corrections. See D-107."
echo "$CMD" | grep -qE 'pip install .*(torch|tensorflow|segment-anything|ultralytics)' && block "no GPU or vision-model dependencies. See D-113."

exit 0
