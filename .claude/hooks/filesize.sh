#!/bin/bash
# Enforces the 250-line file cap from CLAUDE.md invariant 7.
# A rule stated in prose drifts over a long session; this one cannot.
# PostToolUse cannot undo the write, so it feeds the problem back for Claude to fix.

. "$(dirname "$0")/_json.sh"

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jget .tool_input.file_path)
if [ "$FILE" = "__JGET_NO_READER__" ]; then
  printf '{"decision":"block","reason":"no JSON reader (jq/node/python3) available — the 250-line cap could not be checked for this write. Check the file length yourself."}\n'
  exit 0
fi
# The matcher for this hook is Edit|Write, so .tool_input.file_path is always
# populated in a real payload — empty here means the reader ran but failed to parse
# it, not "nothing to check". Fail closed, not open (2026-08-12), same reasoning as
# guard.sh. A path that doesn't exist on disk is a different, legitimate case (not a
# reader failure) and still skips.
if [ -z "$FILE" ]; then
  printf '{"decision":"block","reason":"could not read the file path from the hook payload — the 250-line cap could not be checked for this write. Check the file length yourself."}\n'
  exit 0
fi
[ ! -f "$FILE" ] && exit 0

case "$FILE" in *.ts|*.tsx|*.js|*.jsx|*.py) ;; *) exit 0 ;; esac

LINES=$(wc -l < "$FILE" | tr -d ' ')
if [ "$LINES" -gt 250 ]; then
  printf '{"decision":"block","reason":"%s is now %s lines, over the 250-line cap in CLAUDE.md. Split it before continuing — do not grow it further."}\n' "$FILE" "$LINES"
fi
exit 0
