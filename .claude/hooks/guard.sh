#!/bin/bash
# Deterministic guardrail. CLAUDE.md is advisory; this is enforcement.
# A PreToolUse hook returning exit 2 blocks the call in EVERY permission mode,
# including bypassPermissions. Safety-critical rules belong here, not in prose.

. "$(dirname "$0")/_json.sh"

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jget .tool_input.command)

block() { echo "Blocked: $1" >&2; exit 2; }

[ "$CMD" = "__JGET_NO_READER__" ] && block "no JSON reader (jq/node/python3) available — cannot inspect this command safely."
# The matcher for this hook is Bash, so .tool_input.command is always populated in a
# real payload — empty here means the reader ran but failed to parse it (bad JSON,
# unexpected shape), not "nothing to check". Fail closed, not open (2026-08-12).
[ -z "$CMD" ] && block "could not read the command from the hook payload."

# Long-running servers are mine. Claude never starts them.
echo "$CMD" | grep -qE '(npm|pnpm|yarn|bun) run dev' && block "I run the dev server in a separate terminal."
echo "$CMD" | grep -qE 'next dev|vite( |$)|nodemon'   && block "I run the dev server in a separate terminal."
echo "$CMD" | grep -qE 'python3? -m http\.server|make serve' && block "I serve the verify page in a separate terminal."

# Irreversible.
echo "$CMD" | grep -qE 'rm +-[a-zA-Z]*[rf]'      && block "recursive/forced delete. Do it yourself if you mean it."
echo "$CMD" | grep -qE 'git +push.*--force'      && block "force push."
echo "$CMD" | grep -qE 'git +reset +--hard'      && block "hard reset. Use /rewind or do it yourself."
echo "$CMD" | grep -qiE 'drop +(table|database)' && block "destructive SQL."

# `supabase db reset` (local target only) is deliberately NOT blocked (user's explicit
# instruction, 2026-08-12 — see CLAUDE.md's Commands section for the no-remote-link
# reasoning). Everything that can target or create a remote link stays blocked: `db push`,
# `db reset --linked`/`--db-url` (both reset a REMOTE database per `supabase db reset
# --help`, not the local one), and `supabase link` itself, since linking would silently
# invalidate the no-remote-link precondition the CLAUDE.md permission rests on.
echo "$CMD" | grep -qE 'supabase db push|supabase link|supabase .*(--linked|--db-url)' \
  && block "remote-targeting supabase commands are mine to run. Local-only \`supabase db reset\` is allowed. See D-011."

# tools/pipeline — normalised drawings, exports, and the local-only rule.
# Path-scoped, not word-scoped: the bare word `overrides` false-positived on
# `spec/17-pipe-overrides-raster.md` when that spec was deleted (2026-08-17). A markdown file
# named after the thing is not the thing.
echo "$CMD" | grep -qE 'rm .*(tools/pipeline/(overrides|out)/|\.dxf)' && block "that path holds a normalised drawing or a human-verified export. See D-118."
echo "$CMD" | grep -qE 'pip install .*(torch|tensorflow|segment-anything|ultralytics)' && block "no GPU or vision-model dependencies. See D-113."

exit 0
