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

15. **2026-09-08 (plan 28) — a whole new subsystem with no `NAVIGATION.md` row at all.** Six
    new `components/map/` modules (`mapBackdrops`, `mapBackdropTransform`, `drawBackdrop`,
    `loadMapBackdrop`, `mapBackdropLabels`, plus `config/mapBackdrop.json`) and a new
    `ColonyCanvasLayer.setBackdrop` method shipped while `NAVIGATION.md` still lists
    `setGrassImage` as the only post-mount swap and describes `drawColony.ts`'s paint order
    without the backdrop. CLAUDE.md tells the next session to use `NAVIGATION.md` *instead of*
    exploring. **A plan that lists "new files" should be read as a `NAVIGATION.md` checklist:
    every new module and every new public method on an existing class needs a row.**

16. **2026-09-08 (plan 28, second pass) — the `DECISIONS.md` index row and the decision
    *filename/title* assert a property the plan's own Non-goals rule out.** D-036 is filed as
    `D-036-synthetic-georeferenced-backdrop-…` and indexed as "A synthetic, **georeferenced**
    aerial-style backdrop", while `mapBackdropTransform.ts`'s header says "manual eyeball
    placement -- no real surveyed anchor points exist yet" and plan §4 explicitly excludes
    `georeference.py`/`anchor_transform.py`. The decision *body* never claims georeferencing —
    only the one-line summary a future session actually reads does. **Read every D-xxx
    filename and `DECISIONS.md` row as a load-bearing claim and check it against the code, not
    against the decision body it summarises.**

17. **2026-09-08 (plan 28, third pass) — the diff edited the very NAVIGATION.md row whose
    "only place" claim it invalidated, and left the claim.** That row still reads "`view.ts`
    (… `colonyLatLngBounds`/`leafletViewState`, the **only** place SVG space is bound to
    Leaflet)" while the same commit adds `useMapBackdrop.ts:45-57` (`paddedColonyLatLngBounds`
    writes `lat = -y` by hand) and `mapBackdropLabels.ts:33` (`L.marker([-worldY, worldX])`).
    Plan §1 asserted the same thing about itself: "nothing new in this plan re-derives it".
    **A row you are editing anyway gets read for its new clause and not its old one — reread
    the whole row, and treat any word like "only"/"single"/"never" in it as an assertion the
    diff must be checked against.**

18. **2026-09-12 (plan 29) — a NAVIGATION.md row documenting a function the diff deleted.**
    Row 268 still describes `resolveMapBackdrop(colonyId, surface)` and its whole mechanism
    ("a hand-written map joining a statically-imported image `assets/backdrops/<id>.jpg` with
    its `config/mapBackdrop.json` entry"), after the diff replaced it with
    `resolveMapBackdropFromRow(client, row, surface)` reading Storage + `colonies.backdrop_*`.
    Same diff also left `## Backlog` item 6 unstruck though it shipped it (item 1 above it
    shows the `~~…~~ **Done <date>**` convention), and added no `NAVIGATION.md` row for the new
    `lib/colony/colonyBackdrop.ts` or the two new admin-portal routes. **Rule: any diff that
    renames or deletes an exported function must grep `NAVIGATION.md` for the old name —
    a stale row is worse than a missing one, because it tells the next session to call
    something that no longer exists.**

19. **2026-09-12 (plan 30) — the *same row* as item 18, now stale in the opposite direction.**
    Row 269 (`uploadColonyBackdropImage`/`updateColonyBackdropTransform`), written one session
    earlier to fix item 18, says "Called **only** from `admin-portal/backdropRoutes.ts`'s two
    routes" — the diff adds a second caller (`features/colony-picker/ColonyBackdropScreen.tsx`,
    an authenticated-client path) and changes both functions to throw on a zero-row update.
    Rows 187/191 (colony picker, in-app onboarding) also gained nothing for the new screen.
    Confirms item 17's rule from the other side: a row added by a *previous* review's fix is
    exactly the row the next feature falsifies, because it now contains a fresh "only".
    **Grep `NAVIGATION.md` for every function name in the diff's changed-files list, not just
    renamed/deleted ones.**

20. **2026-09-12 (plan 31) — `contract/SPEC.md` declares a manifest field with no producer.**
    The new `colony.backdrop` block is described as "the source of truth for the backdrop's
    alignment/appearance", but `tools/pipeline/pipeline/export/manifest.py::build_manifest`
    never emits it (checked: `colony_out` has 8 keys plus optional `select_zoom`), so the only
    way it enters a `colony.json` is a hand-edit — which the next `make export` overwrites
    wholesale, i.e. invariant 6 / D-118 ("no stage may hold a correction a rerun would
    silently discard"), and invariant 1's "changing the contract means changing both halves in
    one commit". **Rule: for every new optional field a diff adds to `colony.schema.json`,
    grep the pipeline's emitter for the key. A field only the app writes/reads is either a
    DB column or a rerun-losable hand-edit, never a manifest field.**

21. **2026-09-13 (plans 31+32) — row 269 stale for the *third* consecutive plan, and the
    escape hatch the docs name is removed by the other half of the same diff.** Two shapes
    in one pass:
    (a) `NAVIGATION.md:269` still says "Two callers today: … `features/colony-picker/
    ColonyBackdropScreen.tsx`" after the file moved to `features/colony-upload/` and
    `applyManifestBackdrop` became a third caller; `NAVIGATION.md:187` still documents the
    per-row "Backdrop" button/`onBackdrop` the same diff deleted; `PROGRESS.md`'s `## Current`
    still names "owner clicks 'Backdrop' on a real colony" as the next action. Item 19's rule
    has now failed three plans running on the same row — **treat any diff touching
    `colonyBackdrop.ts` or a `features/**` file move as requiring a NAVIGATION grep, not
    optional.**
    (b) `contract/SPEC.md` + the schema `description` tell the operator "omit the key entirely
    on a routine geometry-fix replace to leave an existing backdrop untouched" — but task H of
    the same plan makes `build_manifest()` emit `backdrop` on *every* export once
    `colonies/<id>.json` declares it, so the documented opt-out is unreachable and the UI form
    (kept, per §4, as the way to adjust values) is silently reverted on the next
    re-export+upload. **Rule: when a diff adds a second writer for a value, check that the
    escape hatch the docs promise is still reachable from the *new* pipeline, not just from
    the one that existed when the sentence was written.**

22. **2026-09-13 (plan 32, build pass) — fixing a false analogy introduced a *new* false
    superlative in the same sentence.** Item 21(b)/`review_comments_outrun_code`'s "the same
    way `select_zoom` is" was correctly repaired, but the replacement text now claims
    `backdrop` is "**the only** field in `colony.json` that comes from the colony config
    rather than the drawing" — `build_manifest()` (`export/manifest.py:76-83`) copies
    `config.id`, `config.name` and `dict(config.source)` straight from the same
    `colonies/<id>.json`. Repeated verbatim in 5 places (`contract/colony.schema.json:51`
    description, `contract/SPEC.md:119`, `extract/types.py:66`, `PROGRESS.md:31`,
    `docs/cad-layer-standard.md:181` as "unlike every other field above"), and
    `DECISIONS.md:90`'s D-123 row still says "mirroring `select_zoom`'s passthrough" while
    D-123's own body (line 47) explains select_zoom is *derived*, not a passthrough.
    **Rule: a superlative in a doc ("the only", "the first", "unlike every other") is a
    claim about a set — enumerate the set from the producer function before accepting it.
    And when a review forces a doc rewrite, re-check the replacement sentence: the rewrite
    is written from the same memory that produced the original error.**

23. **2026-09-13, plans 31+32 — the superlative moved rather than went away.** #22's "the
    only field from the config" was repaired, and in the same diff `NAVIGATION.md`'s
    colony-onboarding row gained a new one: `ColonyBackdropScreen.tsx` is "the only
    reachable entry point for setting a colony's backdrop image/alignment now that the
    picker's per-row button is gone". `apps/map/admin-portal/backdropRoutes.ts` +
    `static/backdropEditor.js` still exist and still write the same 8 columns with the
    service-role key — and the *same NAVIGATION row two entries below* lists them as a
    caller. Consequence beyond the doc: D-049's "copy your UI tweak back into
    `colonies/<id>.json` or the next export/upload reverts it" warning was added to
    `contract/SPEC.md`, the schema `description`, `docs/cad-layer-standard.md` and
    `ColonyBackdropScreen.tsx`'s hint — but **not** to the admin-portal editor, which is the
    other UI whose edits D-049 now silently reverts.
    **Rule: when a diff removes one entry point, grep for the others before writing "the
    only" — and when a warning is added to one write path, list every caller of the
    underlying function and check each got it.**

24. **2026-09-13 (plan 32, next pass) — #23 was reported and *not* fixed; both halves of it
    are still in the tree.** `NAVIGATION.md:191` still ends "…the only reachable entry point
    for setting a colony's backdrop image/alignment now that the picker's per-row button is
    gone", while rows 269 and 280 of the same file still document
    `apps/map/admin-portal/backdropRoutes.ts` + `static/backdropEditor.js` as live writers of
    the same 8 columns (both files exist; `server.ts:25` imports `handleBackdropRoute`). And
    `grep -rn "D-049\|colony.json" apps/map/admin-portal/` is still empty — the "copy your
    tweak back into `colonies/<id>.json` or the next export reverts it" warning landed in
    `contract/SPEC.md`, the schema `description`, `docs/cad-layer-standard.md` and
    `ColonyBackdropScreen.tsx`'s hint, but not in the other UI it applies to.
    **Rule: a doc finding is not closed until re-grepped in the next pass — a review that
    triggers four documentation edits will look "addressed" while the fifth site, the one in
    a different language/directory (here plain JS under `admin-portal/`), is silently
    skipped. Re-run the previous pass's grep verbatim.**
    *CLOSED 2026-09-13, next pass: `NAVIGATION.md:191` now reads "the only **in-app** entry
    point … (the admin portal's own backdrop editor, row below, still writes the same
    columns)", and `backdropEditor.js:76-85` carries the D-049 copy-it-back warning. Both
    re-grepped. Keep the rule; do not re-litigate this instance.*

**How to apply:** on any review that touches `CLAUDE.md`, `.claude/settings.json`, or a
skill file, open `.claude/hooks/guard.sh` and `_json.sh` and check the greps in the same
pass. This has now recurred ten times — worth a CLAUDE.md line or a guard.sh self-test.
Related: [[project-autonomous-loop]], [[review-diff-blind-spots]],
[[review-fixture-plot-count-drift]], [[review-line-cap-breaches]],
[[review-contract-widening-consumers]].
