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

5. **A config file is not a running system, and a `GRANT` statement is not the grant table.**
   2026-08-15 (plan 09, M8): `supabase/config.toml` gained `enable_signup = false` and
   `[auth.sessions] timebox = "24h"`, and PROGRESS.md recorded them as "accepted with no
   error by the CLI during `make db-up`/`supabase db reset`". Neither was in effect —
   `docker inspect supabase_auth_colony-map --format '{{range .Config.Env}}...'` showed
   `GOTRUE_DISABLE_SIGNUP=false` and no `GOTRUE_SESSIONS_TIMEBOX`, because `supabase start`
   on an already-running stack and `db reset` both leave the auth container untouched;
   only `supabase stop && supabase start` recreates it. Self-signup with the anon key then
   returned a full `authenticated` session that read every table. Same pass: the migration
   commented "no client role gets insert/update … enforced here at the grant layer", but
   `information_schema.role_table_grants` still showed `TRUNCATE` (which bypasses the
   append-only row triggers) for `anon`/`authenticated` on all three tables.
   **Check the runtime, not the file: `docker inspect` env for config.toml claims,
   `information_schema.role_table_grants` / `pg_policies` / `proacl` for migration claims.**

6. **`docs/cad-layer-standard.md` is prose whose enforcing layer is
   `contract/colony.schema.json`.** 2026-08-20 (plan 12): the standard's feature-keyword
   table gained `RESERVED → reserved` and `OTHER → other`, but the schema's
   `features[].kind` enum is still `["park","clubhouse","temple","tank","playground",
   "parking"]` with `additionalProperties: false`, and `contract/SPEC.md` says a new
   amenity kind needs a new `<symbol>`. A colony normalised per the updated standard emits
   a manifest the contract rejects — CLAUDE.md invariant 1 ("changing it means changing
   both halves in one commit"). **On any `docs/cad-layer-standard.md` diff, grep the
   values it names against `contract/colony.schema.json`'s enums.**

7. **`spec/*.md` sentences that describe the *other half's* behaviour are unenforced
   assumptions.** 2026-08-20 (plan 14, M13): `spec/13-pipe-derive-export.md:49` says the
   pipeline's embedded fallback `<style>` block is fine because "The app's stylesheet
   overrides it". It does not — the app inlines the SVG into the live DOM
   (`parseColonySvg.ts` → `L.svgOverlay`), so an SVG `<style>` becomes a **document-scoped**
   sheet that loads *after* the bundled CSS and wins every equal-specificity tie
   (`.road`, `.garden`, `.amenity`, `.plot`, `.plot-label`, `.site-boundary`). Same pass:
   `.claude/rules/tier-1.md` says "No `fill`, no `stroke`, no `style`. Ever. **Verified by
   grep in the QA gate**" — `pipeline/export/qa.py::run_qa` never receives the SVG string,
   so that grep exists only in a unit test. **On any pipeline `export/` diff, check that
   every guarantee tier-1.md attributes to "the QA gate" is actually a check in `qa.py`,
   and treat any spec sentence about what `apps/map` will do as a claim to verify against
   `apps/map/src/`.**

**How to apply:** on any review that touches `CLAUDE.md`, `.claude/settings.json`, or a
skill file, open `.claude/hooks/guard.sh` and `_json.sh` and check the greps in the same
pass. This has now recurred seven times — worth a CLAUDE.md line or a guard.sh self-test.
Related: [[project-autonomous-loop]], [[review-diff-blind-spots]],
[[review-fixture-plot-count-drift]].
