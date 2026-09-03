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

8. **A `contract/` change has four restatements, not two.** 2026-08-21 (plan 15): the plot
   `svg_id` pattern was widened to allow a blockless `plot-07`, and `contract/SPEC.md` +
   `docs/cad-layer-standard.md` were updated — but `.claude/rules/tier-1.md:122` ("Ids are
   `plot-{BLOCK}-{number}`", under *The contract is shared*) and `NAVIGATION.md`'s
   `assign_plot_numbers` row ("default = `config.blocks[0]`") still state the old contract.
   Both are files CLAUDE.md tells the next session to read *instead of* the code.
   **On any `contract/` diff, grep the old pattern repo-wide — at minimum
   `.claude/rules/*.md`, `NAVIGATION.md`, `spec/*.md`, and module docstrings.**

9. **Drift also runs the other way: enforcement stricter than the doc, added outside the
   plan.** 2026-08-21 (plan 15 build): `pipeline/extract/dxf.py:40-43` added an unplanned
   `default_block must be in blocks` `DxfConformanceError` (plan §2.4 pinned only the
   `data.get(...)` resolution expression), while the same diff rewrote
   `docs/cad-layer-standard.md:47` to say `blocks` lists the letters used for *explicitly
   prefixed* labels — under which `"blocks": [], "default_block": "A"` is the natural config
   and now hard-errors, and `"blocks": []` alone silently makes every plot blockless (it
   used to `IndexError`). **When a build adds validation the plan didn't ask for, check the
   doc it ships alongside actually states the new rule.**

10. 2026-08-24 (plan 19) — **a doc's normative table left contradicting the prose added below
    it.** `docs/cad-layer-standard.md`'s "Feature labels" section gained a paragraph saying a
    `COL-FEATURE-NO` label inside no ring is a legal free-floating road annotation, while the
    layer table at line 22 still reads `COL-FEATURE-NO | TEXT or MTEXT | **1 per feature** |
    Insertion point inside its own feature`. The table is the part the owner follows in
    AutoCAD. Same diff: `contract/SPEC.md` scopes `data-rotation`/`data-label-height` to
    "A `plot-label` carries …", but `build_svg` now emits both on `feature-label`.
    **When a diff relaxes a rule, grep the same doc (and `contract/SPEC.md`) for the *old*
    wording — summary tables and class tables are where the stale absolute survives.**

11. 2026-08-29 (plan 20) — **two at once, both the classic shapes.** (a) A new
    `make ui` target in both Makefiles carries the comment "I run this, not Claude — same
    reason as serve", but `guard.sh:22` only greps `python3? -m http\.server|make serve`,
    and CLAUDE.md's "Never run:" list was not extended. A Makefile comment grants nothing.
    (b) `docs/cad-layer-standard.md` gained a ninth `COL-*` layer row while line 200 still
    reads "Create the **eight** layers above" and the numbered per-colony procedure
    (196-221) gained no step for it — the checklist the owner actually follows now
    contradicts the table above it, same as (10). `tools/cad-lisp/cv-tools.lsp`'s
    `CV-LAYERS` list is a third restatement and was also missed.
    **On any new layer/target/permission: grep the doc for the *count word* ("eight",
    "seven"), the numbered procedure, `cv-tools.lsp`'s `CV-LAYERS`, and `guard.sh`.**

12. **2026-08-31 (plan 23).** Task I required the new `admin-portal` guard to cover a direct
    invocation "so routing around the Makefile target does not bypass the guard." The rule
    `(pnpm|npm run) admin-portal|tsx .*admin-portal/server\.ts` only matches the *adjacent*
    form; `pnpm -C apps/map admin-portal` and `pnpm --dir=apps/map admin-portal` both exit 0
    (probed). That is the natural form from the repo root, where no `admin-portal` script
    exists. **Probe a new guard rule with the flag-carrying variant, not just the textbook
    one.**

13. **2026-09-03 (plan 27) — `NAVIGATION.md`'s reusable-function table restates exported
    *signatures and behaviour*, and nothing regenerates it.** `parseSimpleBulkImportCsv`
    gained a third `noOwnerTokens` parameter and its "blank/`NMC` → `available`" rule became
    per-colony; the table row (line 248) still shows the 2-arg signature and the hardcoded
    `NMC`. The new shared `resolvePresentationConfig` — imported by seven files — got no row
    at all. **On any diff that changes an exported signature or adds a helper used by 3+
    files, grep `NAVIGATION.md` for the function name before accepting the diff.**

14. **2026-09-03 (plan 27, second pass) — same file, same diff, two rows still stale after
    the first review's NAVIGATION.md edit.** The wrap updated the `parseSimpleBulkImportCsv`
    row and added a `resolvePresentationConfig` row, but left `formatShareSummary(data, now?)`
    (now `(data, now?, statusLabels?)`) and `renderColonyPreview(container, svg, statuses?)`
    (now `(…, colonyId?)`) — the latter row also still asserts "`ColonyUploadScreen.tsx`'s
    call is unchanged", which the same diff falsified. **Editing NAVIGATION.md at all is not
    evidence it is now correct: enumerate every exported signature the diff touched and grep
    each one, including the ones that only gained an optional trailing parameter.**

**How to apply:** on any review that touches `CLAUDE.md`, `.claude/settings.json`, or a
skill file, open `.claude/hooks/guard.sh` and `_json.sh` and check the greps in the same
pass. This has now recurred ten times — worth a CLAUDE.md line or a guard.sh self-test.
Related: [[project-autonomous-loop]], [[review-diff-blind-spots]],
[[review-fixture-plot-count-drift]], [[review-line-cap-breaches]],
[[review-contract-widening-consumers]].
