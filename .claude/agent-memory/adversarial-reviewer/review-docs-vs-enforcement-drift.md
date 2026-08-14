---
name: review-docs-vs-enforcement-drift
description: Recurring defect in this repo — prose (CLAUDE.md, README, skills) states or relaxes a permission while the enforcing layer (.claude/hooks/guard.sh, _json.sh, settings.json) is left inconsistent, too broad, or fails open.
metadata:
  type: feedback
---

Whenever a diff touches a permission or process statement in prose, diff it against the
layer that actually enforces it before concluding. Specifically:

- `CLAUDE.md` "Never run:" list  <->  `.claude/hooks/guard.sh` `block` greps
- `.claude/skills/*/SKILL.md` allowed-tools / gates  <->  `.claude/settings.json` permissions
- `PROGRESS.md` "verified by running X"  <->  whether the hook would have let X run at all

Three checks that have each caught a real defect:

1. **Prose can never grant a capability on its own.** `guard.sh`'s own header says
   "CLAUDE.md is advisory; this is enforcement", and a PreToolUse exit 2 blocks in *every*
   permission mode including bypassPermissions.
2. **When a guard is relaxed, check the relaxation is no wider than its justification.**
   If the prose names a precondition ("safe because no remote project is linked"), grep for
   the flag that breaks it. 2026-08-12: the whole `supabase db reset` block was deleted,
   which also unblocked `supabase db reset --linked` / `--db-url` — both destructive
   against a *remote* database — and nothing blocks `supabase link` from invalidating the
   stated precondition.
3. **Enforcement code must fail closed.** `.claude/hooks/_json.sh` `jget` returns empty
   when no JSON reader is found or parsing fails, and both `guard.sh` and `filesize.sh`
   then `exit 0`. A Windows Microsoft-Store `python3` stub caused exactly this silent total
   bypass once already (2026-08-12). Reordering the interpreter preference mitigates that
   instance; it does not make the layer fail closed.
   **4th recurrence, 2026-08-12 (later same day):** a `__JGET_NO_READER__` sentinel was
   added — but it only fires when `command -v` finds *no* reader, which is the unreachable
   case in a repo that ships node. The reachable case (reader found, output empty: stub
   interpreter, parse failure) still hits `guard.sh`'s `[ -z "$CMD" ] && exit 0` and skips
   every check. Verified by piping `not json at all` into `guard.sh` → exit 0, no block.
   Both hooks match on tool types where the field is always populated (`Bash` →
   `.tool_input.command`, `Edit|Write` → `.tool_input.file_path`), so empty is *always* a
   reader failure and should block. Re-check this exact line on any hook diff.

4. **The 250-line cap (invariant 7) is narrower than its prose.** `filesize.sh:25` is
   `case "$FILE" in *.ts|*.tsx|*.js|*.jsx|*.py) ;; *) exit 0 ;; esac` — `.css`, `.sql`,
   `.md`, `.json` are all unchecked. 2026-08-14 (M6): `apps/map/src/styles/colony-theme.css`
   went 179 → 263 lines in one diff and nothing objected. **Run `wc -l` on every non-TS
   source file a diff touches**; the hook will not do it for you.

**How to apply:** on any review that touches `CLAUDE.md`, `.claude/settings.json`, or a
skill file, open `.claude/hooks/guard.sh` and `_json.sh` and check the greps in the same
pass. This has now recurred five times — worth a CLAUDE.md line or a guard.sh self-test.
Related: [[project-autonomous-loop]], [[review-diff-blind-spots]],
[[review-fixture-plot-count-drift]].
