# Portable JSON field reader. Sourced by the hooks.
# Prefers jq, falls back to python3, then node — so the hooks work on a machine
# where jq was never installed. A hook that silently fails is worse than no hook.
jget() {  # usage: echo "$INPUT" | jget .tool_input.command
  local path="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$path // empty"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for k in '$path'.strip('.').split('.'):
    d = d.get(k) if isinstance(d,dict) else None
    if d is None: sys.exit(0)
print(d)"
  elif command -v node >/dev/null 2>&1; then
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{let o=JSON.parse(s);for(const k of '$path'.replace(/^\./,'').split('.')){o=o&&o[k];}if(o!=null)console.log(o);}catch(e){}})"
  fi
}
