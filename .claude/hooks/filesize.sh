#!/bin/bash
# Enforces the 250-line file cap from CLAUDE.md invariant 7.
# A rule stated in prose drifts over a long session; this one cannot.
# PostToolUse cannot undo the write, so it feeds the problem back for Claude to fix.

. "$(dirname "$0")/_json.sh"

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jget .tool_input.file_path)
{ [ -z "$FILE" ] || [ ! -f "$FILE" ]; } && exit 0

case "$FILE" in *.ts|*.tsx|*.js|*.jsx|*.py) ;; *) exit 0 ;; esac

LINES=$(wc -l < "$FILE" | tr -d ' ')
if [ "$LINES" -gt 250 ]; then
  printf '{"decision":"block","reason":"%s is now %s lines, over the 250-line cap in CLAUDE.md. Split it before continuing — do not grow it further."}\n' "$FILE" "$LINES"
fi
exit 0
