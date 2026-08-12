# Portable JSON field reader. Sourced by the hooks.
# Prefers jq, falls back to node, then python3 — node before python3 because on
# Windows `command -v python3` can find a Microsoft Store "App execution alias" stub
# that isn't real Python: it prints a Store-install prompt and produces no JSON, so
# `jget` silently returned empty and every guard.sh check below was skipped without
# any error (discovered 2026-08-12 — `supabase db reset` ran without the hook firing).
# A hook that silently fails is worse than no hook, so node (present in this repo's
# own toolchain, no stub problem) goes first among the two script fallbacks.
jget() {  # usage: echo "$INPUT" | jget .tool_input.command
  local path="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$path // empty"
  elif command -v node >/dev/null 2>&1; then
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{let o=JSON.parse(s);for(const k of '$path'.replace(/^\./,'').split('.')){o=o&&o[k];}if(o!=null)console.log(o);}catch(e){}})"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for k in '$path'.strip('.').split('.'):
    d = d.get(k) if isinstance(d,dict) else None
    if d is None: sys.exit(0)
print(d)"
  else
    # No reader at all — emit a sentinel instead of silent empty output, so callers
    # can fail CLOSED (block/flag) instead of the empty string reading as "nothing to
    # check here" and letting every guard through unexamined.
    printf '__JGET_NO_READER__'
  fi
}
