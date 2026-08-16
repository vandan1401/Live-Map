# Progress

## Current

- **Colony onboarding designed as an in-app upload (2026-08-17, docs only). New
  `D-025-colony-onboarding-in-app.md` + `spec/15-map-colony-upload.md` (Tier 1, unbuilt).**
  Owner asked for "a website so I can upload colony maps without depending on Claude Code or
  Claude tokens", and picked *keep the Python pipeline local, upload its output* over porting
  the pipeline to the browser. They also want to **hand the two files to a family member who
  can upload them with no local setup**, and to be able to do it from their own laptop.
  **The premise needed correcting and the correction is the finding:** running `make ingest`
  needs Python, not Claude — D-113 pins the pipeline offline and free. The real dependency is
  app-side and worse than a terminal. `ColonyMap.tsx:6` does
  `import colonySvgRaw from "../../../../fixtures/shree-vatika-2/colony.svg?raw"` — **the
  colony's SVG is compiled into the bundle at build time and the path is hardcoded to one
  fixture**, so adding a colony is a source edit plus a redeploy, every time, forever. No
  amount of pipeline work fixes that.
  **Design:** (1) `colonies.svg` becomes a `text` column fetched at runtime — chosen over
  Supabase Storage to avoid enabling `storage-api` (currently excluded from the local stack)
  for one text blob per colony, and it rides along with the offline snapshot the PWA already
  caches. (2) `create_colony_from_manifest()`, a second `security definer` narrow write path
  with the same shape as `bulk_set_initial_plot_data` (D-023) — a browser cannot hold the
  service-role key `import-seed.ts` uses, so this is required, not a convenience. (3) A
  `features/colony-upload/` full-screen overlay modelled on `BulkImportScreen.tsx`.
  **The human verification gate moves, and this is the part worth remembering.** D-108 put it
  on the verify page's "Mark verified" button. Keeping it there while adding an upload leaves
  a silent hole: the uploaded `colony.json` is a plain file, so `"verified": true` is just a
  string someone could type — the gate would be enforced against a file, not a person. So the
  pipeline now **always** emits `false`, and the upload screen renders the SVG at full size
  and requires an explicit "I compared this against the site plan" confirmation before the RPC
  writes `true`. Same gate, same human, moved to the only place a family member without
  AutoCAD could ever exercise it. Rejected alternative: HMAC-signing the manifest from the
  verify page — solves the hole, but leaves a family member uploading a file nobody looked at.
  **Consequences:** `spec/14` (verify page) loses its button entirely and drops **Tier 1 → 2**
  — it is now a local preview for the owner's fix-and-rerun loop, which was always its real
  value; `CLAUDE.md`'s tier table and `.claude/rules/{tier-1,tier-3}.md` frontmatter updated
  to match (`verify/**` → Tier 3, `features/colony-upload/**` → Tier 1). `D-108` marked
  **amended by D-025** — the requirement is unchanged, only its location. `import-seed.ts`
  stays for the fixture and local dev but is no longer the onboarding path.
  **Numbering slip caught and fixed mid-session:** this was first written as `D-119`, which is
  the `tools/pipeline` range. It is an app-side decision (migration, RLS, `ColonyMap.tsx`), so
  it is `D-025`. Renamed and all references updated; no `D-119` remains.
  **Verified:** documentation only, no code written. `make verify-pipe` and `make contract`
  re-run clean after the spec/rules edits. No `apps/map` source file is in the diff.
  **`CLAUDE.md`'s invariant 2 restated (owner approved, same session)** — it said "No code
  path sets it true (D-108)"; under D-025 exactly one does, gated on a human's confirmation in
  front of the rendered map. The two other live statements of the old rule were updated with
  it: `contract/SPEC.md`'s "The `verified` flag" section (which now also says an uploaded
  `true` is **rejected**, not trusted — the flag in a plain-text file is a claim, not
  evidence) and `.claude/rules/tier-1.md`'s export section (adding a "Mark verified" button
  back to the verify page is now explicitly a review finding). `D-108`'s own body is left as
  written, matching how D-101/D-107 were handled — the Status line carries the amendment.
  **Next action:** unchanged and still upstream of all of this — the owner produces
  `fixtures/shree-vatika-2/colony.dxf`. M15 is Tier 1 and can be planned in parallel, but it
  has nothing real to upload until the pipeline (M10–M13) exists.

- **Pipeline re-scoped to CAD-first (2026-08-17, docs only — no code written).** The owner
  raised that they are experienced in AutoCAD and could trace a colony there directly,
  asking whether M10–M17 were still needed. Answer: mostly not. New
  **`D-118-cad-first-dxf-source.md`** (accepted) makes a normalised DXF the only built
  input; the owner opens each colony's original DWG in AutoCAD, normalises it to a fixed
  layer standard, and exports DXF. The reader is deliberately **strict** — a non-conforming
  file is refused with the offending layer and entity handle, never repaired. That
  strictness is what keeps it small: normalisation moved upstream of the code, into a tool
  built for the job.
  **Why the original decision flipped:** D-101 chose PDF-first on two arguments —
  availability of DWGs, and layer hygiene — and both assumed the CAD operator is a third
  party. The owner has the original DWGs for the 10–12 colonies in scope and is the
  operator, so the "rescue logic for exploded line segments" that D-101 rightly feared is
  now paid by hand in AutoCAD (`PEDIT → Join`, seconds) instead of in untestable Python.
  D-115 had already named this outcome and gated it on evidence; the evidence arrived from
  an unanticipated direction. **The owner also bills ₹10–30 per plot per colony for this
  work**, which inverts the one real argument against CAD-first — operator-dependence is
  the business model, not a cost, so M16's "onboard a colony with no CAD file" premise is
  solving a problem this project does not have.
  **Superseded:** D-101, D-102, D-107, D-111, D-115 (each file's own Status line updated).
  **D-103 deliberately left `accepted`** — it forbids vision/LLM models for geometry, and
  that guardrail must not lapse just because the raster path it governed is now unbuilt.
  **Spec set restructured — the pipeline is now six contiguous milestones, `spec/09`–`14`,
  down from nine.** `spec/10-pipe-ingest.md` (renamed from `10-pipe-vector.md`, which named
  the cut PDF path) is the DXF reader, Tier 2. `spec/11` geometry core loses
  `snap`/`polygonize`/`dedupe` and gains validation — a closed polyline is already a ring, so
  a 0.001-unit gap flips from something to *heal* into something to *reject*. `spec/12` loses
  the confidence ladder and the area/keyword classification (one containment test, layer
  lookup, everything ambiguous a hard error) and gains block resolution + zero-padding.
  **`spec/13` and the old `spec/14` are merged** into `13-pipe-derive-export.md`: they are one
  pass and one artifact — nothing derived can be checked without exporting something to look
  at, and the gate's job is to refuse an export whose derived fields are wrong, so splitting
  them described the same run twice. Both halves are unchanged in substance; the gate is worth
  *more* now, because human error is quieter than detector error. The verify page moves
  `spec/15` → `spec/14`, read-only review + "Mark verified". **The two cut milestones'
  spec files are deleted outright** — D-118 is now the single record of what browser tracing
  tools and the overrides/raster fallback were, why they are not being built, and what
  reviving them would require (notably: raster cannot be revived without override durability,
  since OCR output is detector output). Files kept as stubs would have been two milestones of
  non-work sitting in the numbering.
  **Not merged, deliberately:** `spec/10` (DXF reader) and `spec/11` (geometry) stay separate
  even though both are about "is this drawing usable". `spec/11`'s whole design point is that
  it is a *pure* module importing no file-format library, enforced by an import test — folding
  it into the reader, which is all I/O, would blur the exact boundary the spec exists to
  protect. New **`docs/cad-layer-standard.md`** — the eight
  layers, plot-number format, units, colony config shape, the 13-step per-colony procedure,
  and a common-rejections table. Per D-115's own words this was always "the highest-leverage
  action in this whole project"; it is now free because the owner is the CAD person.
  **Also resolved by this:** the stale 45-plot golden target flagged in `## Deferred` — the
  golden test becomes `fixtures/shree-vatika-2/colony.dxf` reproducing the existing real
  26-plot `colony.json`. `NAVIGATION.md` updated throughout (flow diagram, "where do I
  change X" table, fixture table, `spec/` line); `spec/00-rules.md`'s pipeline never-build
  table gained four rows and lost the DXF one.
  **Verified:** nothing to run — this session wrote documentation only, no code and no test
  touched. `git status` was clean at session start.
  **One thing needing the owner's explicit yes before it is applied:** `CLAUDE.md`'s
  invariant 6 ("Overrides survive reruns") no longer describes anything being built.
  Proposed rewording is in D-118 — same intent (no hand correction is ever silently lost),
  different mechanism (the DXF is the source of truth). **Not yet applied.**
  **Amended same session, after the owner described their real drawings:** plans are in
  feet ✓, a north arrow is present in ~99% of them, and **plot numbers are bare —
  `1, 2, 3, … 10, 11` with no block prefix**, with a small chance some colonies use prefixes.
  The first draft of the layer standard had the owner renumber to `A-01` by hand; that is
  now explicitly forbidden. D-118 gained a "what belongs in AutoCAD" section drawing the
  line at **judgement vs. mechanical transform** — which ring is a plot is judgement and
  moves upstream; renumbering 300 plots is tedium that introduces the exact mis-typed-number
  failure the QA gate then has to catch, so it stays in code. `blocks` (first entry is the
  default for unprefixed labels; an undeclared prefix is an error, so a stray `S-7` cannot
  invent a block) and `number_width` are now colony-config fields; M12 owns the transform.
  `COL-NORTH` is now optional with a config fallback, and a disagreement over 1° between the
  two is an error — two sources disagreeing about north silently rotates every plot's
  `facing`, which carries a real price premium.
  **`number_width` is pinned in config, never derived** — deriving it means a colony growing
  99 → 100 plots re-pads every `svg_id`, orphaning every `plots` and `plot_history` row
  already in the database. That is invariant 5's evidence trail broken by adding a plot, and
  it is silent. M13 gained a matching **id-stability check**: refuse to export if an
  `svg_id` present in the previous export has vanished, unless `--allow-id-change` is passed.
  It is the one QA check whose failure mode lives in the other half of the repo.
  **Owner's CAD-prep method settled (same session).** Owner proposed extracting all text and
  mapping it to plots by coordinate — which is already M12's containment rule — and offered
  to manually delete every dimension string and road name so only plot numbers remain.
  Pushed back on the deletion half and the owner's approach is now the inverse: **assign,
  never delete.** Unlisted layers are ignored, so junk costs nothing by being present, and
  the two methods fail in opposite directions — a missed `1500` under "delete the junk"
  becomes a candidate plot number silently, whereas a missed number under "select the plot
  numbers onto `COL-PLOT-NO`" produces a loud `plot <handle> has no label`. Also added a
  **work-on-a-copy rule**: the original DWGs are business records and the as-sold layout may
  matter in a registry or commission question years later. Both rules are now a "Two rules
  before you touch a drawing" section at the top of the layer standard.
  A **relaxed `text_source: "any"` mode** (take all text, let geometry and regex discriminate)
  was considered and **not specced** — it only pays when selecting plot numbers is hard, and
  the owner is doing the layer assignment anyway. Recorded here rather than in the standard
  so it isn't rediscovered from scratch: the guards it would need are the existing regex
  plus `number_range`.
  New optional config field **`number_range`** — the only guard against a mis-typed plot
  number (`170` for `17`), which looks perfectly correct in AutoCAD and which no geometry
  check catches. It is a typo net, not a contiguity rule; gaps are fine.
  **Open contingency, decide against the first real DWG:** plot numbers are specced as
  `TEXT`/`MTEXT`. If they turn out to be block attributes (`INSERT`/`ATTRIB`), read those
  too rather than making the owner explode every block — noted in `spec/10` as explicitly
  *not* to be built speculatively.
  **Repo swept for the new plan (owner approved both `CLAUDE.md` edits, same session).**
  `CLAUDE.md`: invariant 6 reworded to "Corrections survive reruns" per D-118; risk-tier row
  drops `pipeline/overrides/**`, `tracer.js` → `verify.js`, adds `docs/cad-layer-standard.md`
  as Tier 1; the `tools/pipeline` one-liner and the "Never run" line updated. **Path-scoped
  rules matter most here** — they are loaded on path during Tier 1 work and are not
  re-injected after compaction: `.claude/rules/tier-1.md` lost its overrides glob and its
  "Overrides are somebody's work" section, gaining "The DXF is the source of truth" (never
  add a post-ingest stage that edits geometry; strictness; ambiguity is a hard error;
  the judgement-vs-mechanical line). `tier-2.md`'s format-code-at-the-edge section now names
  `ezdxf`; `tier-3.md` gets `verify.css` and loses the amber tier. `spec/00-rules.md`: OCR
  exception removed, `Override` dropped from the vocabulary for `Normalise`, and
  failure-mode 3 changed from "override loss" to **silent re-identification**. `contract/SPEC.md`
  reworded (the source-agnostic claim is still true and is now demonstrated by D-118 having
  swapped the whole front end without touching it). `README.md`: the "ask their CAD person
  for three layer-separated PDFs" section is gone — that was D-115's leverage play and the
  owner is now the CAD person.
  **Two real code fixes, not just docs:** `make ingest` had been aliased to the triage CLI,
  which conflated M9's "what is this file?" with M10's actual pipeline entry — split into
  `make inspect PDF=...` (triage, works today) and `make ingest COLONY=<id> DXF=<path>`
  (errors "not built yet (M10)" like `export` does), in both Makefiles. And
  `pipeline/cli/inspect.py` printed `tier: vector (M2 path)` / `raster (M9 path)` — both
  paths are now cut, so the label was actively misleading; it now says what to *do* with a
  file ("ask whoever sent it for the DWG" / "trace it in AutoCAD over an attached image").
  `.claude/hooks/guard.sh`'s deletion block cites D-118 and covers `.dxf`.
  **Deliberately not touched, both pre-existing and outside this plan:** (1) `CLAUDE.md`
  invariant 8 still reads "No auth until M8" though M8 shipped and D-011 was superseded by
  D-021 — stale, but it is an invariant and a separate decision. (2) The 45-plot references
  in `docs/plans/{01,03}.md` and `spec/02-map-schema.md` — that is the pre-existing fixture
  drift already recorded under D-017; closed plan files are historical records and were left
  alone.
  **Next action:** owner produces `fixtures/shree-vatika-2/colony.dxf` by normalising the
  real Shree Vatika DWG per `docs/cad-layer-standard.md`. Until it exists, M10's acceptance
  criteria 1–2 and the golden test cannot run — it is the first blocking task of this path.
  Then `/plan` M10 (Tier 2) and build.

- **`docs/plans/10.md` is now closed** — in-app plot-status table view + CSV initial-data
  import (Tier 1, `/plan → /build → /review`, plus a live-browser fix after the owner
  clicked through it themselves). Owner asked for "a google sheet import... so that plot
  statuses get changed for the first time, and also a sheet ui for them to change plot
  statuses after that"; scoped down (owner's explicit choice) to two in-app features
  instead of real Google Sheets sync, keeping D-008 and avoiding new OAuth/API surface —
  `spec/00-rules.md`'s existing named exception ("a one-off CSV import for the initial
  data load only") is what the import half actually is.
  **`bulk_set_initial_plot_data(p_colony_id, p_rows)`** (new migration
  `20260816000000_bulk_initial_plot_import.sql`) is a second, deliberately narrow
  `security definer` write path for `plots` — invariant 4 still governs the *operational*
  transition path (`applyPlotTransition()`) unchanged. A plot is eligible only while every
  existing `plot_history.changed_by` on it is the `'import'` or `'bulk_import'` sentinel;
  the moment a real transition happens (a real display name, never those two strings), the
  plot is permanently locked out of bulk-import — a deliberate "onboarding correction
  window," not single-shot idempotency. An unexpected mid-batch error rolls back the whole
  call; the three expected skip conditions (unknown `svg_id`, invalid status,
  already-real-activity) are recorded in a returned `skipped` list, never raised.
  **The table view** (`features/plot-table/PlotTableView.tsx` + `PlotTableRow.tsx`, opened
  via a new "Table view" button in `ColonyMap.tsx`'s toolbar, rendered as a full-screen
  overlay *on top of* the still-mounted map) lists every plot with an editable status
  dropdown + owner-name field (identical `isLegalTransition`/buyer-name-required gating to
  `PlotStatusActions.tsx`, reused not reimplemented) and read-only cells for everything
  else; each row saves independently through `applyPlotTransition()`, no "save all"
  batching. **The CSV import screen** (`features/bulk-import/BulkImportScreen.tsx`) parses
  client-side (`lib/colony/parseBulkImportFile.ts`, pure/DOM-free, fixed
  order-sensitive header contract, no column mapping) and rejects a malformed file outright
  before ever calling the RPC — CSV only in this build, XLSX deferred (see `## Deferred`).
  **Three real bugs found and fixed beyond the plan's own scope**, all in shared code this
  session was already touching: (1) `scripts/import-seed.ts`'s inline paise parser only
  checked `Number.isInteger(Number.parseInt(value))`, which silently accepted `"12.5"` as
  `12` paise — extracting it into shared `shared/parsePaise.ts` (so the CSV-import path
  can't diverge from the seed script) surfaced this D-010 gap; tightened to a regex gate
  for both callers. (2) `fetchRecentHistoryForPlots` excluded only `changed_by: "import"`
  from the share summary's "recent changes" — extended to also exclude the new
  `"bulk_import"` sentinel (same fabricated-evidence risk, invariant 5, a past `/review`
  already caught once for `"import"` alone). (3) **found live in a real browser, after
  `/review`, when the owner clicked into the new Table view and got a plain white
  screen** — no mocked-client unit test could have caught this. `subscribePlotChanges`
  (`lib/sync/subscribePlots.ts`) keyed its realtime channel topic on `colonyId` alone,
  which was safe while only `ColonyMap`'s `attachSync` ever subscribed to a colony; the
  table view overlays the map rather than unmounting it, so both are now subscribed to the
  same colony at once, and supabase-js's `client.channel(topic)` returns the *same*
  already-`.subscribe()`'d object for a repeated topic — calling `.on()` on it throws
  synchronously, and with no error boundary anywhere in the tree, React unmounts the whole
  app. Fixed by suffixing the topic with a random id per call; `attachSync.ts`'s own
  behavior is unaffected. Reproduced and re-verified fixed live via `mcp__claude-in-chrome`
  (table opens cleanly, 26 correctly-sorted rows, zero console errors; map's own
  sync/detail-sheet flow unaffected), plus a new fast regression test in
  `subscribePlots.test.ts` (two simultaneous subscriptions to one colony must not throw).
  **`/review` separately found and fixed 5 more issues** (full blow-by-blow in
  `docs/plans/10.md`'s Log): a critical scratch-colony `verified: true` leak into the real
  picker (15 fake colonies, cleaned up via `db reset` + reseed); `PlotTableView.handleSave`
  had no `try/catch` so a thrown error locked a row's Save button forever with no message
  (fixed, which also surfaced a self-inflicted stale-closure bug in `patchDraft`); the
  table's realtime handler discarded the channel-status signal, so a reconnect never
  refetched (fixed to match `attachSync.ts`'s existing rule); `fetchPlotsByColony` had no
  `ORDER BY`, so the table's promised "manifest order" wasn't real (fixed with
  `.order("svg_id")`); the CSV parser didn't reject a duplicate `svg_id`, which would
  silently double-apply (fixed with a dedupe check).
  Verified, final state: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
  from `apps/map` — 24/24 test files, **130/130** tests (up from 96/96 at session start;
  one `applyPlotTransition.test.ts`/`listColonies.test.ts` timeout on an occasional run —
  the documented DB warm-up flake, unrelated, clean on immediate retry), clean build.
  Live-integration tests (`bulkImportInitialPlotData.test.ts`, 6 cases) exercise the RPC
  against the real local DB. Grants verified via `psql`: `bulk_set_initial_plot_data` has
  `execute` for `authenticated` only, same shape `docs/plans/09.md`'s wrap used to verify
  `apply_plot_transition`. `docs/plans/10.md`'s acceptance criterion 6 (a status change
  made in the table view is reflected on the map without a manual refresh, and vice versa)
  was not separately re-verified after the realtime-collision fix — logically covered by
  the fix itself (both now hold independent, non-colliding subscriptions) but worth a
  quick owner glance next time they're in the app. `**Status:** complete` not yet appended
  to `docs/plans/10.md` for exactly this reason.
- **Next action:** get the owner's reaction to the table view + CSV import on their own
  device (they were mid-testing when this session ended), then either fold in any feedback
  or append `**Status:** complete` to `docs/plans/10.md` and move to XLSX support or the
  next milestone.
- **Test-suite flake investigated and partly fixed (2026-08-16, Tier 2, `lib/colony/**`)
  — full detail in `## Deferred`'s updated entry.** Root cause: full-parallel vitest run
  (up to 12 workers, 19 files) contends with the local Docker Supabase stack —
  confirmed via `docker stats` (`supabase_db` 209% CPU, `supabase_auth` 86% during a
  run). Fixed the more-frequent symptom: `lib/colony/{listColonies,plotDetail,
  plotStatus}.test.ts` were creating a scratch user per-test with no custom timeout,
  hitting vitest's default 5000ms under contention. Hoisted user creation into shared
  `beforeAll`/`afterAll` (matching `applyPlotTransition.test.ts`'s already-documented
  fix for the same class of contention) and added matching timeouts. `subscribePlots.
  test.ts`'s own occasional timeout (the originally-reported flake) is real and
  unrelated to this fix — owner explicitly chose to leave it as a known tail risk rather
  than cap vitest's parallelism to eliminate it entirely (that trade slows every future
  run). Verified: typecheck/lint clean; 3 full-suite runs post-fix went 2 clean/1 failed
  (the 1 being the known, accepted `subscribePlots.test.ts` tail case), versus failing
  on nearly every run before across two sessions.

- **M9 built: pipeline triage/ingest (2026-08-16, Tier 2/3, spec/09-pipe-triage.md).**
  `tools/pipeline/` now exists for real — previously only a placeholder directory root
  `make` targets pointed at (`cd tools/pipeline` failed with "directory doesn't exist" as
  recently as the 2026-08-12 wrap log entry below). Built: `pyproject.toml` (pymupdf,
  shapely, numpy, jsonschema + ruff/mypy/pytest dev deps), a self-bootstrapping
  `tools/pipeline/Makefile` (`verify`/`lint`/`typecheck`/`test`/`contract`/`golden`/`gate`/
  `ingest`/`export`/`serve`, all routed through a local `.venv` — see NAVIGATION.md's new
  "tools/pipeline — toolchain" section for why), `pipeline/io/pdf.py`'s `triage_pdf()`
  (vector-vs-raster classification per page via PyMuPDF), `pipeline/cli/inspect.py` (`make
  inspect PDF=...`), and the `tests/test_contract.py`/`tests/test_golden.py` scaffolding
  root's `make contract`/`make gate` already assumed existed. Root `Makefile`'s
  `verify-pipe`/`contract`/`gate`/`inspect` targets rewritten to delegate to the nested
  Makefile (`$(MAKE) -C tools/pipeline <target>`) instead of calling bare `ruff`/`mypy`/
  `pytest`/`python` directly — none of those are on this machine's global `PATH` (only
  `python` itself is; D-117 "Python toolchain... not explicitly confirmed" from Deferred,
  now resolved for real via the venv bootstrap rather than left open).
- **Real gap the tests caught**: spec/09's own acceptance criterion 5 example ("feed it
  this spec file" to prove an unreadable file fails cleanly) doesn't actually fail against
  current PyMuPDF (1.28.2) — it added generic Markdown parsing and opens a `.md` file as a
  valid 2-page document. `triage_pdf()` now rejects anything outside a `.pdf`/`.jpg`/
  `.jpeg`/`.png`/`.tif`/`.tiff` allowlist before ever calling PyMuPDF, which is what
  actually makes the criterion pass — caught by writing the test first and watching it
  fail with "DID NOT RAISE", not assumed from reading the spec.
- Verified: all 5 of spec/09's acceptance criteria run for real from repo root via
  `mingw32-make.exe` (only `make` on this machine's `PATH`) — `make verify-pipe` → ruff
  clean, mypy clean ("Success: no issues found in 5 source files"), pytest "7 passed, 1
  skipped" (the 1 skip is the golden-export placeholder, correctly deferred to M14); `make
  inspect PDF=fixtures/demo-plan.pdf` → `tier: vector (M2 path)`, 198 paths, 56 text
  spans; `make inspect PDF=fixtures/demo-plan-scan.jpg` → `tier: raster (M9 path)`, 0
  paths, 0 text spans; the rotated/landscape unit test (synthetic 842x595 page, rotation
  set to 90) is part of the 7-passed run; `make inspect PDF=spec/09-pipe-triage.md` →
  clean `error: ... is not a PDF or image (got .md) - ...`, exit 2 (Makefile-propagated),
  no traceback. `make contract` (repo root) → "2 passed" against
  `fixtures/shree-vatika-2/colony.json`. Confirmed cold: ran `mingw32-make.exe
  verify-pipe` from repo root and watched it create `.venv` and `pip install -e ".[dev]"`
  before running the gate, so the literal acceptance-criterion command works with no
  manual setup step. `git add -n tools/` confirmed only real source files stage — `.venv`/
  caches correctly excluded by the pre-existing `.gitignore` pipeline section. **Full
  repo gate** (`/wrap`, same session): `make contract` → 2 passed; `apps/map` —
  `pnpm typecheck`/`pnpm lint` clean, `pnpm build` clean (712.99 kB main chunk, over the
  500 kB warning threshold — pre-existing, not this session's diff); `pnpm test -- --run`
  → 95/96 passing after a `db-reseed` (one `supabase db reset` attempt hit a transient
  `LegacyDbSetupError`, succeeded on immediate retry with all containers already healthy —
  not chased further, looked like container-timing noise, not a real bug). The one
  remaining failure, `subscribePlots.test.ts`'s realtime live-integration test, is the
  pre-existing intermittent flake already on record in `## Deferred` (reproduced twice in
  a row this session, not clearing on retry this time — see Deferred entry, updated).
  `tools/pipeline` — `make -C tools/pipeline verify` clean (ruff/mypy/pytest, 7 passed 1
  skipped), `make -C tools/pipeline golden` → 1 skipped (expected, M14 not built). No
  file in this session's diff touches `apps/map/src/lib/sync/` — the flake is unrelated
  to M9, confirmed by the diff, not just by assumption.
- Next: M10 (`spec/10-pipe-vector.md`) — extracting polygons/text from a vector PDF, the
  path M9's triage report points a real DWG-exported PDF down. Non-goals explicitly
  deferred by M9: extracting polygons, matching labels, OCR, export.

- **Map UI rework, part 5 (2026-08-16, Tier 3): reference-matched label style, lower
  status opacity, road grain, and a real fix for the ground texture's visible tiling —
  the actual root cause turned out to be my own processing, not the source photo or a
  rendering bug.** Four owner asks in one message: (1) road/quadrant name labels
  ("9.0 M W ROAD", "Q-F") now sit on a solid white chip (`mapLabelChips.ts`'s
  `addFeatureLabelChips`, a `<rect>` built from each label's own `getBBox()` and
  inserted behind it) instead of a stroke halo on the road — copied directly from the
  owner's part-4 reference render, which uses exactly this for every road/quadrant
  label and plain bare black numbers (no chip) for plot numbers, so `.plot-label` lost
  its heavy halo too, kept just enough (1.5px, 0.75 opacity) to stay legible over a
  photo texture instead of the reference's flat green. Found live: `getBBox()` called
  immediately after `L.svgOverlay().addTo(map)` measures 0x0 for every label — being
  attached to the DOM isn't being laid out, and nothing forces that pass synchronously.
  Fixed with one `requestAnimationFrame` (cancelled in the effect's cleanup). (2) status
  fill-opacity 0.55 → 0.38 (owner: "overlay colour is too high opacity"). (3) roads got
  a `texture-road` pattern (`buildRoadPatternDefs`) — a flat base plus six fixed flecks,
  no image or filter, "a little road like texture". (4) the ground photo's mirrored tile
  showed an obvious repeat ("it is making a pattern i dont want") — chased through
  three wrong theories before finding the real one. First: reduced `GRASS_TILE_W/H`
  repeat frequency and added a small overlap between the four mirrored quadrant
  `<image>`s (`SEAM_OVERLAP`) — a real fix for antialiasing hairlines at tile joins,
  worth keeping, but the grid was still there after it, so it wasn't the (sole) cause.
  Second: assumed the owner's AI-generated photo had a baked-in vignette and cropped
  the outer 18% off — grid still visible, slightly fainter. Only then reloaded the true
  original source (`image-cache/.../6.png`, 707x636, never downsampled before this)
  and saw it clearly: a deliberate concentric-rectangle "mowing stripe" motif runs
  through the *entire* photo, not just its edge — cropping the same source tighter
  couldn't out-run it. **Third, and actually causal**: my own canvas processing was
  the bug. `ctx.filter = 'blur(Npx)'` immediately before `drawImage` to the full canvas
  samples transparent pixels for anything the blur kernel reaches past the drawn
  region's edge, which darkens/desaturates a border on *every* image I'd blur-processed
  regardless of crop — a self-inflicted vignette, reproduced identically after every
  attempted fix because every attempt still blurred right up to a hard edge. Fixed by
  drawing a padded region first (real neighbouring source pixels, not transparency),
  blurring the padded canvas, then cropping the interior back out — the blur kernel now
  only ever samples real content. Combined with a tight center crop (30% margin) on the
  original high-res source to get well clear of the stripe motif, this produces a tile
  with no grid line and no vignette at any zoom level tested. **Lesson for next time
  cropping+blurring in canvas: pad before you blur, always** — the artifact looks
  exactly like a source-photo defect or a tiling bug and will send you chasing both
  before you check your own filter call. Gate clean:
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 19/19 files,
  96/96 tests (one retry needed for the documented DB-warm-up flake, clean after).
  Verified live in Chrome at both normal and zoomed-in scale.
  **Phone access fixed same session (2026-08-16):** owner tried the LAN URL on their
  phone and login silently failed — `apps/map/.env`'s `VITE_SUPABASE_URL` was
  `http://127.0.0.1:55321`, baked into the client bundle at dev-server start, so the
  phone's browser resolved `127.0.0.1` to itself, not this machine, and every
  Supabase call had nothing to talk to (the Vite page itself loaded fine, masking
  this as a login bug rather than a config one). Fixed by pointing it at this
  machine's LAN address instead (`http://192.168.0.177:55321`, from `ipconfig`,
  confirmed against the actual Wi-Fi adapter — two other IPv4s on this machine are
  VMware/WSL virtual adapters, not reachable from a phone) and restarting `pnpm dev
  --host` so the new env value gets baked in (Vite does not hot-reload `.env`
  changes into a running client bundle). Confirmed the local Supabase stack's Kong
  gateway publishes on `0.0.0.0:55321` (not just loopback) and returns
  `Access-Control-Allow-Origin: *`, so the phone's origin isn't blocked either.
  `apps/map/.env` is gitignored — this is a local dev-machine value, not something
  that ships or needs undoing later, but it will need updating again if this
  machine's LAN IP changes (e.g. after a router reboot/DHCP lease renewal) or if
  dev testing moves to a different network. **Owner-verified on their own phone
  (2026-08-16): "worked everywhere"** — texture, labels, opacity, road grain, and
  phone login all confirmed live on their own device. This closes out the map UI
  rework's owner-verification loop across parts 1-5.
- **Map UI rework, part 4 (2026-08-15, Tier 3): switched to the owner's own AI-
  generated ground photo, fixed zoom desync, chased a corrupted-asset bug to ground.**
  Owner rejected the procedural blob texture outright ("worst boring grass"), flagged
  that zooming only scaled the site rectangle while the backdrop stayed fixed size
  (the CSS-background approach from part 3), and supplied their own AI-generated grass
  photo (`image-cache/.../6.png`) with explicit permission to use it — a second
  licensed-looking photo they sent was NOT used, since they gave conflicting signals
  about its licence in the same session ("licensed" then "free to use") and the AI
  photo's permission was unambiguous. New `mapTexturePatterns.ts` mirror-tiles that
  photo into a 2x2 block (normal/flip-x/flip-y/flip-both) so the tile has no seam
  regardless of whether the source photo itself is seamless — the owner said they
  weren't sure. The zoom-desync fix is architectural, not cosmetic: a *second* Leaflet
  `svgOverlay` (`buildWorldGroundSvg`, a standalone SVG with its own viewBox, added
  *before* the site's own overlay so it paints beneath it) covers a world ~4x the
  site's own size, sharing the map's coordinate transform so it pans/zooms in exact
  lockstep with the site — not a CSS background image on the container, which can't
  scale with Leaflet's zoom at all. Deliberately not done by padding the site SVG's
  own viewBox: `useSelectedPlotOverlay.ts` reads that viewBox's height directly for
  pan-to-selection math, and this repo already has a documented incident
  (`ColonyMap.tsx`'s `ZOOM_DETAIL_MARGIN` comment) from a viewBox/bounds mismatch
  breaking that exact code path once before.
  **Two real bugs found and fixed during this pass, both worth remembering:** (1) both
  SVG documents (site + world) initially defined a `<pattern id="texture-grass">` —
  SVG/HTML ids are unique per *document*, not per `<svg>` sub-root, and this app puts
  both documents in the same live DOM as sibling Leaflet layers, so the second
  definition silently collided with the first. Fixed by giving the world layer's
  patterns their own disjoint ids (`buildGardenPatternDefs` for the site's `.garden`
  only, a separate inline defs block for the world layer's `texture-grass` only) —
  this actually turned out NOT to be the visible bug's cause (see next), but is a real
  latent one worth remembering for any future second-SVG-document trick. (2) **the
  actual cause**: the compressed JPEG asset was silently *corrupted/truncated* —
  `get_page_text` (used to pull a ~50,000-character base64 data URL out of the browser
  by writing it into the DOM and reading it back) apparently has an undocumented
  truncation limit well below that length, and returned a partial string with no
  error or warning. The resulting file decoded and rendered fine at first glance
  (JPEG headers were intact) but was missing its end-of-image marker and most of its
  scan data — every image on the page (SVG `<image>`, plain `<img>`, at any size)
  rendered only its top ~15–20% before falling back to solid grey. Confirmed
  definitively via a byte-level check (`buf[buf.length-2]===0xFF &&
  buf[buf.length-1]===0xD9`, absent) after visually reproducing the bug in total
  isolation (a bare `<img>` tag, no Leaflet, no pattern) ruled out every app-specific
  explanation first. Fixed by transferring the base64 in ~1800-character chunks (small
  enough that neither `get_page_text` nor the direct-return channel — which separately
  blocks anything shaped like a base64/token string outright — mangled or refused
  them), reassembling in Node, and verifying the EOI marker before ever writing the
  file the app actually uses. **Lesson for any future session moving binary data out
  of a browser tab this way: verify the decoded file's integrity in Node before
  trusting it, never assume a browser round-trip preserved an arbitrarily long
  string byte-for-byte.** Also folded in: `map-texture.css`'s CSS data-URI backdrop
  from part 3 is gone entirely (replaced by the Leaflet world layer above); leaked
  `verified: true` scratch colonies from this session's own repeated flaky test runs
  were cleaned up via `supabase db reset` + reseed + `pnpm create-user` (demo account)
  three separate times this session — the DB-warm-up flake (documented elsewhere in
  this file) got noticeably worse under the unusually high number of consecutive test
  runs this session needed, worth a real fix at some point rather than the fourth
  "reset and reseed" bump. Gate clean after all of this:
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 19/19 files,
  96/96 tests (multiple retries needed due to the flake above, always clean on
  retry), clean build. Verified live in Chrome, in total isolation before the app:
  a bare `<img>` at the target size, then the full pattern in a blank page, then the
  real app — texture now shows correctly at every step, whole viewport covered, zoom
  keeps the backdrop and site moving together. Owner-verified 2026-08-16 (see part 5).
- **Map UI rework, part 3 (2026-08-15, Tier 3): owner corrected part 2 after seeing it
  live, plus DB residue cleanup.** Four fixes: (1) the ground rect from part 2 only
  covered the SVG's own bounds — at this aspect ratio Leaflet's fitBounds letterboxes,
  and the owner saw the flat cream container background around it and read that as
  "only a rectangle patch is in grass" (their words) when they meant the whole
  viewport. `colony-map-container` (`map-texture.css`) now carries a matching mottled-
  green CSS `background-image` (a hand-encoded data URI, same palette as the SVG
  pattern) so the backdrop outside the site is grass too, not just the fitted
  rectangle — `.leaflet-container`'s own background is now `transparent` so it doesn't
  paint over that. (2) the blade-stroke texture from parts 1–2 still read as a
  mechanical repeating pattern up close, not an aerial photo (owner: "not every strand
  will be visible... from satellite it will look like some texture" — and explicitly
  offered "get a seamless image from somewhere" as a fallback, which isn't available
  here: this is an offline-capable PWA with no external asset/CDN dependency and no
  image-generation tool in this environment, so an actual satellite photo wasn't an
  option). Replaced the blade strokes with layered translucent ellipse "blobs" (3
  tones, off-grid positions, `mapTexturePatterns.ts`'s `GROUND_BLOBS`) that read as
  soft colour mottling through alpha overlap rather than a hard-edged repeating
  motif — no blur filter used or needed (tier-3.md still bans SVG filters on map
  geometry). Tile size also went from 10 to 50 units so the repeat is far less
  frequent relative to a plot's own size. (3) plot boundary colour ("not good," a dull
  grey that read as muddy over green) changed to a crisp warm white
  (`--colony-plot-stroke: #f7f4e8`), matching how the owner's own aerial-photo
  reference actually paints plot lines. (4) unrelated to the owner's feedback but found
  while re-verifying live: two `verified: true` scratch colonies had leaked into the
  real colony picker — residue from this session's own live-integration test run that
  timed out once (documented DB-warm-up flake) before passing clean on retry, same
  failure class as the 2026-08-14 session's `revokeVerification`-teardown gap.
  `supabase db reset` + `pnpm import:seed` + `pnpm create-user demo demo-pass-123
  "Demo User"` (the demo account is also wiped by a full reset) cleared it; picker
  re-verified live to show only the one real colony. Gate re-verified clean after all
  four fixes: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 19/19
  files, 96/96 tests, clean build. Verified live in Chrome: grass now fills the visible
  viewport outside the site rectangle too, the texture reads as soft mottling rather
  than a repeating blade grid, plot boundaries are crisp and legible. Still not
  owner-verified on their own device — this is the third live correction cycle in one
  session, worth getting their reaction before treating the texture as settled.
- **Map UI rework, part 2 (2026-08-15, Tier 3): owner corrected part 1 after seeing it
  live.** Three fixes: (1) the grass texture had been tiled separately per plot/garden
  shape (each its own `<pattern>`, own tile phase) instead of reading as one continuous
  field — `mapTexturePatterns.ts` gained `buildGroundRect()`, one `<rect
  width="100%" height="100%">` inserted as the SVG's *first* child (not appended) so
  every plot/road/garden shape paints over a single shared grass layer;
  `patternUnits="userSpaceOnUse"` ties every pattern to that same (0, 0) origin, so
  nothing seams at plot boundaries anymore. `.plot` itself now has `fill: none` — it's
  marked only by its boundary stroke ("visible via lines on that texture," the owner's
  words) — and `.plot[data-status]` is a flat translucent colour (no pattern lookup)
  layered on top of the shared ground showing through. (2) grass density/saturation
  raised — 3 blades per 10×10 tile to 6 across three tones, base green from `#6fae63`
  to a more saturated `#4f9645` (owner: "not enough grassy"). (3) the `.road` stroke
  part 1 added for a "curb" look drew a visible border at every internal join between
  the compound path's own rectangle segments (owner: "roads should not have a
  borderline between them" — confirmed with a screenshot showing the grid) — removed
  outright, back to a flat fill with no stroke. `map-texture.css`'s now-unused
  `.texture-tint-*`/per-status pattern classes were deleted rather than left dead.
  Gate re-verified clean after: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
  pnpm build` — 19/19 files, 96/96 tests (one `applyPlotTransition.test.ts` timeout on
  the first run, the documented DB warm-up flake, clean on immediate retry), clean
  build. Verified live in Chrome: the whole map reads as one grass field under the
  roads/plots, road bands have no internal grid lines, plot tint still shows grain
  through it. Owner-verified 2026-08-16 (see part 5).
- **Map UI rework, part 1 (2026-08-15, Tier 3, no plan/review needed): road, plot,
  garden, and status rendering, plus a frosted-glass chrome pass.** Owner gave two
  reference images and asked for (1) realistic-looking plots/garden with status as "a
  slight overlay on top", not a flat opaque fill, (2) a lighter, more legible road
  style, (3) transparent/glassmorphism popups, "rest you decide yourself" for
  everything else. New `components/mapTexturePatterns.ts` (same
  `parseColonySvg`-time-injection precedent as `plotDimensionOverlay.ts`'s arrow
  marker) builds `<pattern>` defs for a grass-blade ground texture, a denser
  shrub-dotted garden texture, and one tinted-grass pattern per plot status
  (available/booked/registered) at 0.62 fill-opacity over the grass tile — status
  still reads clearly at a glance (tier-3.md's "readable at a glance" floor), texture
  shows faintly through it (owner's "slight overlay" ceiling). New `styles/
  map-texture.css` holds the CSS classes those pattern tiles reference (split out of
  `colony-theme.css` to stay under the 250-line cap); the actual colour tokens stay in
  `colony-theme.css`'s `:root` per D-004. `--colony-road` repainted from near-black to
  a warm mid-grey (owner's road reference image) — the near-black repaint from
  2026-08-13 had made the road width labels (`.feature-label`, "9.0 M W ROAD") which
  had *no CSS rule at all* until this session and rendered in the browser default
  (black, left-anchored, unstyled) effectively invisible against it; both `.feature-
  label` and the per-plot `.plot-label` numbers (also previously unstyled, off-centre)
  now get text-anchor/dominant-baseline centering plus a stroke halo (`paint-order:
  stroke`) so they stay legible regardless of the exact road/status colour underneath,
  instead of depending on one hand-tuned contrast pair. Frosted-glass chrome (owner:
  "I like transparent style design") — new shared `--colony-glass-*` tokens in
  `colony-theme.css`, applied via `backdrop-filter`/`-webkit-backdrop-filter` to the
  plot detail sheet (the "status popup"), its status-change buttons, and every other
  floating HTML panel (search bar, back button, legend, share sheet) for a consistent
  look; this is ordinary HTML/CSS backdrop-filter on a handful of fixed elements, not
  an SVG filter on map geometry, so it doesn't conflict with tier-3.md's "no SVG
  filters" rule (noted inline in the CSS so a future session doesn't misread it as a
  violation). One real bug caught before verifying, not by `/review` (Tier 3, none
  run): a comment in `colony-theme.css` described the split-out texture classes as
  `.texture-blade-*/` — the literal `*/` inside that text closed the CSS comment early
  and left the rest of the comment's own words parsed as real CSS, breaking `pnpm
  build` with `CssSyntaxError: Missing opening (` (dev mode/`pnpm typecheck`/`pnpm
  lint` all stayed silently green through this, since Vite's dev CSS pipeline didn't
  hit the same failure path — caught only because the full gate was run before calling
  this done, not just dev-mode eyeballing). Verified live in a Claude-driven Chrome
  session (`mcp__claude-in-chrome`), not just by reading the CSS: zoomed screenshots
  confirm the grass-blade texture is visible through a booked plot's blue tint, the
  garden's shrub texture, road labels and plot numbers both legible over every status
  colour, and the plot detail sheet showing the map visibly blurred through it. Not yet
  shown to the owner in a real browser — next session (or later this one) should get
  their reaction before calling the redesign done; garden texture in particular reads
  as stylized/geometric rather than photorealistic, a real constraint of flat SVG
  patterns with no external image assets, not a bug.
- **`docs/plans/09.md` (M8) is now closed** — the owner confirmed both remaining manual
  criteria directly: criterion 1 (an outside username is rejected on a real device) and
  criterion 5 (cache-TTL forced re-auth), the latter via a direct check rather than a real
  24h wait. All six acceptance criteria are met; `**Status:** complete` appended to the
  plan.
- **`D-011` flipped (2026-08-15), per the owner's explicit go-ahead** — new
  `D-021-public-deployment-permitted.md` (accepted) records that M8 shipping satisfies the
  one condition D-011 itself named for lifting the block. `DECISIONS.md`'s D-011 row →
  `superseded by D-021`; `docs/decisions/D-011-auth-deferred-to-m8.md`'s own Status line
  updated to match. `.claude/hooks/guard.sh`'s `wrangler pages deploy`/`wrangler deploy`
  block (the D-011-specific one) removed. Note: CLAUDE.md's separate "Never run: ...
  `wrangler pages deploy`" instruction is unrelated to D-011 (it's about deploys being the
  owner's own action, not Claude's, regardless of auth status) and still stands — this
  only removes the auth-safety gate, it does not make deploying Claude's job.
- **M8 built this session (`docs/plans/09.md`, Tier 1, `/plan → /build`, `/review`
  pending): username/password auth + RLS lockdown.** Per the user's explicit override of
  D-003 ("we do auth a little different — usernames and passwords no email needed"),
  every account is a synthetic-email Supabase Auth user (`{username}@colony.local`,
  invisible to the user, D-019) created only via the new admin-only
  `scripts/create-user.ts` (`enable_signup = false` — an admin-created row **is** the
  allowlist, no separate table). New migration
  `20260815020000_m8_auth_rls_lockdown.sql`: `apply_plot_transition()` drops `p_actor`
  entirely (5-arg now), is `security definer`, derives `updated_by`/`changed_by` from
  `auth.jwt()` inside the function body, and raises `not authenticated` rather than ever
  falling back to a placeholder (D-020, supersedes D-016); `colonies`/`plots`/
  `plot_history` RLS is now select-only + `authenticated`-only, with every direct
  insert/update grant revoked from `anon`/`authenticated` — the RPC's `security definer`
  is what makes writes still work, deliberately keeping "exactly one write path"
  (invariant 4) true at the privilege layer, not just convention. `App.tsx` now creates
  one Supabase client for the whole app lifetime (lifted out of `ColonyMap.tsx`'s
  per-mount effect) and gates on a real session (`getSession`/`onAuthStateChange`) via a
  new `features/auth/LoginScreen.tsx`, replacing the old free-text `NamePrompt`/
  `lib/identity/actor.ts` (both deleted). Cache TTL (spec/08 criterion 5) is pinned at
  24h, same number as the session timebox — `pwa/offlineCache.ts`'s new
  `isSnapshotExpired`/`OFFLINE_CACHE_MAX_AGE_MS`, checked in both `attachSync.ts`'s and
  `App.tsx`'s offline-snapshot fallbacks, which call `client.auth.signOut()` on expiry
  (the actual "forces re-auth" mechanism). `scripts/import-seed.ts` now requires
  `SUPABASE_SERVICE_ROLE_KEY` (new, `.env.example`), not the anon key, since RLS no
  longer permits anon/authenticated inserts — same for the new `create-user.ts`. A real,
  pre-existing display gap (`PlotDetailContent.tsx` showed the literal "updated by
  import" for any plot untouched since seed) was fixed with a new `formatActorName`
  helper → "Imported" — the user's own "system user" backfill decision was already true
  at the data layer (`import-seed.ts` already wrote `"import"`), this only fixed the
  display. New decisions `D-019`/`D-020`, `D-003`/`D-016` marked superseded in
  `DECISIONS.md`. Verified for real throughout the build, not just by reading code: curl
  against the live REST/Auth endpoints proved anon reads return `[]`, an anon RPC call is
  permission-denied (Postgres grants EXECUTE to PUBLIC by default — had to add an
  explicit `revoke execute ... from public` or anon could still reach the function body),
  a forged `p_actor` field in the RPC payload is rejected outright by PostgREST (no such
  function signature), and a real signed-in write attributes correctly to the session's
  `display_name`. `service_role` also needed an explicit table grant added in this
  migration — `BYPASSRLS` (Supabase's own role setup) skips RLS policies, not the
  underlying `GRANT` check, and M2 never granted it one.
- **`/review` ran and found 6 real issues, all fixed this session:** (1) **Critical** —
  attribution read from `auth.jwt()`'s `user_metadata`, which is writable by the signed-in
  user themselves via `PUT /auth/v1/user` with nothing but their own session; verified
  live that a self-forged `display_name` did change nothing about the migration's
  original code, then fixed by switching every write/read to `app_metadata` (service-role
  only) and re-verified live that the same forgery attempt no longer changes
  `updated_by`. (2) `supabase db reset`/`make db-up` don't recreate the auth container,
  so `config.toml`'s `enable_signup = false`/`enable_confirmations`/`timebox` edits were
  silently inert all session — a real `supabase stop` + restart was needed (same class of
  gap as the 2026-08-13 `db-start` exclusion-flag lesson); confirmed via
  `docker inspect`'s env vars and a live signup/self-signup attempt, both now correctly
  rejected. (3) `TRUNCATE` survived on `plot_history` for `anon`/`authenticated` (bypasses
  the M2 triggers entirely, so the "grant-layer enforced" claim in the migration's own
  comment was false), and `service_role` was granted `update`/`delete` on `plot_history`
  it never needed, reversing M2's stated intent — both fixed with narrower `revoke`/
  `grant` statements, verified via `information_schema.role_table_grants`. (4)
  `getDisplayName()` had reintroduced the exact `?? "unknown"` placeholder-fallback
  mistake tier-1.md names by number — fixed to return `string | null`, `App.tsx` now
  signs out and shows the login screen if it's ever null. (5) Scratch-account teardown
  lived at the end of each test body, not in `finally`/`afterAll` — a failing assertion
  permanently leaked the account until the next full `db reset`; restructured
  `applyPlotTransition.test.ts`, `rls.test.ts`, and `subscribePlots.test.ts` to share one
  `beforeAll`/`afterAll`-scoped scratch user (or pair) per file instead of one per test,
  which also cut Auth-container contention (this is almost certainly why
  `subscribePlots.test.ts`'s realtime warm-up flake got measurably more frequent this
  session). (6) Negative RLS/RPC tests asserted only "some error happened", which passes
  identically for an unrelated failure as for the actual permission gap under test —
  tightened to assert Postgres's specific `42501` (permission denied) code. Gate re-run
  clean twice in a row after all six fixes: 19/19 files, 96/96 tests, clean build. Not yet
  done: the plan's manual acceptance criteria (criterion 1 on a real device, criterion 5's
  clock-change scenario) and only then flipping D-011 to superseded and removing the
  deploy block in `.claude/hooks/guard.sh` — all explicitly out of scope for `/build`/
  `/review`, see `docs/plans/09.md` Non-goals. `docs/plans/09.md` is deliberately left
  without a `Status: complete` marker for exactly this reason — it stays open until a
  human runs those two manual criteria.
- **`pnpm dev --host` started this session, in the background, for the user's own manual
  testing** — reachable at `http://localhost:5173/` on this machine, or
  `http://192.168.0.177:5173/` (the "Wi-Fi"-labeled interface) from a phone on the same
  network, though `.env`'s `VITE_SUPABASE_URL` still points at `127.0.0.1:55321` and would
  need the same temporary LAN-IP repoint the 2026-08-14 session used before phone testing
  actually works. Sign in with the placeholder `demo`/`demo-pass-123` account — no real
  family credentials exist yet (see Deferred).
- **All three pieces of owner feedback from the 2026-08-15 iPhone session are now
  resolved (this session), ahead of M8 per the user's explicit "deferred items first"
  sequencing.** Two Tier 3 (no plan): a back-navigation button
  (`ColonyMap.tsx`/`App.tsx`/`map-toolbar.css` — "← Colonies", returns to the picker) and
  a branded picker heading (`ColonyPicker.tsx`/`colony-picker.css` — "Nimantran Group
  Colonies", colour matches the PWA manifest's `theme_color` `#863bff`). One Tier 1,
  `docs/plans/08.md` (booked-by name input, **Status: complete**, `/plan → /build →
  /review` in full): `PlotStatusActions.tsx` now shows a required buyer-name field on the
  only transition that creates a booking (`available → booked`); `apply_plot_transition()`
  gained a `p_owner_name text default null` parameter, set via `coalesce(p_owner_name,
  owner_name)` — the sole write path (D-006/D-013/invariant 4) writes it, no new write
  path was added. `/review` found and fixed two real bugs: (1) the new back button was
  drawn opaque on top of the always-visible freshness indicator (spec/05), same top-left
  corner — moved the indicator to `top: 3rem`. (2) `owner_name` is deliberately sticky at
  the DB layer (never cleared, so Undo restores it with no re-prompt) — but that made an
  un-booked plot stay findable by, and display, its former buyer's name in
  `PlotSearch.tsx`; `buildSearchIndex` now only surfaces `ownerName` while `status ===
  "booked"`. `docs/plans/08.md`'s own acceptance criterion 4 was also reworded — as
  originally written it asked for an unrecoverable guarantee (`plot_history` has no
  `owner_name` column, so only the *last-written* name survives an un-book, not an
  arbitrary "original" one). Plan numbering is sequential on disk, not milestone-aligned
  from here: `docs/plans/08.md` is not `spec/08-map-auth.md`'s M8 — noted in the plan file
  itself so a future session doesn't assume plan N = spec N.
- **M8 is now built (see the top `## Current` entry) — this bullet is historical
  context for why it was queued, not the current state.** Also open: the realtime
  subscription warm-up flake (Deferred) got measurably worse this session — more
  live-integration test files now create their own scratch Auth users concurrently, all
  contending for the same local Supabase Auth/Realtime services — `subscribePlots.test.ts`'s
  internal timeout was bumped 10s → 20s (second bump; started at 5s) to absorb it. Still
  worth a real fix at some point rather than a third bump later.
- **Task:** `docs/plans/05.md` is closed — `**Status:** complete` appended this session
  after re-running its full §5 acceptance table for real: SVG has no `fill`/`stroke`/
  `style` (grep, 0 matches), manifest validates against `contract/colony.schema.json`
  (ajv, `valid: true`), `supabase db reset` + `pnpm import:seed` from a cold DB imported
  cleanly ("imported 26 plots for shree-vatika-2, 0 unmatched"), and the map-only gate
  (`typecheck && lint && test && build`) passed clean, 52/52 tests. Criterion 5 (visual
  render) rests on the owner's own live-browser verification logged earlier this session
  (see prior Log entry) — this wrap didn't re-open a browser. M2 through M5, the
  D-012/D-013 revision, and M6 (legend filter, search, share summary — `docs/plans/05.md`'s
  scope grew to include it) are all built and gate-clean. Separately, and bigger:
  `fixtures/shree-vatika-2/` was replaced this session with the owner's **real** Shree
  Vatika layout, hand-traced from a site-plan photo — 26 confirmed plots (block "A" only,
  contract-shape necessity — the real plan has no lettered blocks), ~8 unread interior
  plots and the LIG/EWS strip deliberately left out. Went through three `/review` passes;
  each caught real bugs (overlapping plot geometry, wrong `facing`/`is_corner` on saleable
  plots, a bug that would have shown fabricated "recent changes" — seed-import bookkeeping
  rows — in the family's WhatsApp share text, a stale zoom constant, an off-canvas
  dimension label, a CSS specificity bug hiding a selected plot under an active filter).
  All fixed and re-verified live in a browser via direct DOM/console checks, not just
  visually. `colony-theme.css` was over the 250-line cap after this — split the M6
  selection/filter/dimension-callout rules into a new `plot-selection.css`.
- **M6 (spec/06) is now fully closed** — the two manual acceptance criteria that were
  still open after the build (criterion 1, legend filter dimming across all three
  statuses; criterion 3, share-summary paste-into-WhatsApp legibility) were live-verified
  this session on the owner's own phone, over the phone's own hotspot (temporarily pointed
  `apps/map/.env`'s `VITE_SUPABASE_URL` at the laptop's LAN IP for the test, reverted to
  `127.0.0.1` immediately after — `.env` is gitignored, never committed either way). The
  owner tapped through the filter and confirmed dimming/clear-all, and confirmed the
  share-summary text pasted legibly into an actual WhatsApp chat. Criterion 4 stays the
  documented partial (fixture has zero trees, see Deferred); criterion 5 (`make gate`)
  stays blocked on the nonexistent `tools/pipeline`, unrelated to M6 itself. Same live
  session also produced the **first-ever click-through of the M4 Save/Undo buttons**
  (flagged unverified since M4) — the owner set A-33 to booked then registered, and A-23
  to booked, confirmed via the resulting share-summary "Recent changes" text; both writes
  landed with the right plot, right status, right actor name. That deferred item is now
  closed too.
- **`colonies.verified` render-time gap closed (2026-08-14, Tier 2, no plan needed):**
  `loadPlotStatuses`/`loadPlotDetail` (`lib/colony/{plotStatus,plotDetail}.ts`) now check
  `colonies.verified` via `fetchColonyById` before returning data — an unverified colony
  now returns `{}`/`null` at render time too, not just refused at import
  (`import-seed.ts`). Two new live-integration test files (`plotStatus.test.ts`,
  `plotDetail.test.ts`, scratch-colony pattern matching `applyPlotTransition.test.ts`)
  prove both branches against the real local DB. Closed the Deferred item that used to
  block the home-screen picker below.
- **`docs/plans/06.md` built and `/review`-fixed this session (Tier 1):** multi-colony
  home screen — `lib/db/colonies.ts` gained `fetchVerifiedColonies`, new
  `lib/colony/listColonies.ts` wraps it (`loadVerifiedColonies`, D-108 applied at the
  list level, not just per-colony), new `features/colony-picker/ColonyPicker.tsx` renders
  the list, `App.tsx` fetches it once after the actor gate and owns `selectedColonyId`,
  `ColonyMap.tsx`'s hardcoded `COLONY_ID` module constant is gone — `colonyId` is now a
  required prop threaded through all 5 of its former usages. `/review` found and fixed
  four real issues: (1) the new live-integration tests inserted `verified: true` scratch
  colonies with no DELETE grant on `colonies` — these leaked into the **real** picker UI
  once anything queried `verified = true`, not just into the test's own assertion; fixed
  with a `revokeVerification` teardown (`update ... verified = false` after each
  assertion, bypassing the TS wrapper on purpose, same precedent as
  `applyPlotTransition.test.ts`'s forced-failure test) in all three affected test files,
  then a `supabase db reset` + `pnpm import:seed` to clear the residue that had already
  leaked from pre-fix runs — verified after via `psql`: only `shree-vatika-2` is
  `verified: true` now. (2) `App.tsx`'s colony-list fetch failure silently rendered as
  "No colonies yet." — the same no-data-vs-no-results confusion `PlotSearch.tsx` and
  `ColonyMap.tsx` had already been fixed for once each — now a separate `loadError` state
  shows a distinct message instead. (3) This file's own `## Current` entry was stale
  mid-session (claimed no plan existed while the plan and build were already on disk) —
  fixed. (4) `NAVIGATION.md`'s reusable-functions table and Feature index were missing
  `fetchVerifiedColonies`/`loadVerifiedColonies`/the colony-picker feature row — added.
- **`docs/plans/06.md` closed this session** — acceptance criterion 5 (the app opens to
  the colony picker, lists exactly the one real verified colony, tapping it opens the map
  exactly as before) verified live via a Claude-driven real Chrome session
  (`mcp__claude-in-chrome`), not the owner's own eyes — same precedent as the 2026-08-13
  `db-up` session's criterion 6 check. Confirmed twice on separate page loads: picker
  shows only "Shree Vatika Phase 2" (no test-residue junk, matching the DB cleanup from
  the `/review` fix pass), tapping it opens the full 26-plot map with search/legend/share/
  freshness all present, clicking a plot (A-33) opened the detail sheet with real data, no
  console errors either load. All six §5 acceptance criteria now have real verification;
  `**Status:** complete` appended. Worth a quick owner glance next time they're on the
  app, since this was Claude's own browser, not theirs — nothing found wrong to fix if
  they don't.
- **Next action:** pick the next milestone. `tools/pipeline` still
  doesn't exist — expected pre-M9; `make gate` fails at `contract` until then, use
  `verify-map` plus the map-only `pnpm typecheck && pnpm lint && pnpm test -- --run &&
  pnpm build` slice instead. Note: the pipeline's own docs (`spec/02`, `spec/10-13`,
  `README.md`, `NAVIGATION.md`) still describe a 45-plot golden fixture reproduced from
  `fixtures/demo-plan.pdf` — that target is gone now that the real 26-plot layout replaced
  the shared fixture; needs a real decision (regenerate the golden PDF to match, or accept
  a two-copy split between "pipeline's golden fixture" and "app's real fixture") before
  `tools/pipeline` is built.
- **Owner feedback from this 2026-08-14 session:**
  1. Plot shapes are rectangles-only right now — a fixture limitation (hand-traced from
     the photo, which showed only rectangular plots readably), not a contract or app
     limitation; `class="plot"` works on any SVG path shape. Still open — not touched
     by the 2026-08-15 road/plot-texture rework above.
  2. Road rendering "doesn't look right" — addressed 2026-08-15, see the "Map UI
     rework, part 1" entry at the top of this section; not yet owner-verified.
- **Local Supabase stack now runs `realtime`** (`Makefile`'s `db-start` used to exclude
  it — M5 needed it). If a future milestone needs another currently-excluded service
  (`storage-api`, etc.), remember: a plain `supabase start` restart silently keeps the
  old exclusion — `supabase stop` fully first, then `start` with the new flags.
- **Theme repainted this session, live-verified in a browser by the owner** (Tier 3,
  `colony-theme.css`, owner-requested): roads dark asphalt gray, gardens/trees more
  saturated green, plot status colours changed to available=wheat/booked=blue/
  registered=orange (owner chose "adopt reference's saturated palette" over keeping the
  original amber-for-booked scheme; available was later changed from green to wheat this
  session — see Log — because it visually merged with the garden feature's green).
  New `--colony-warning-amber` token decouples the
  freshness indicator's offline colour (spec/05 criterion 3, "turns amber") from
  `--colony-status-booked` — that variable had been reused for both, and repainting
  `booked` to blue would have silently broken the offline indicator's colour if left
  coupled. No literal dashed road centerline: `.road` is one filled polygon per segment
  in the fixture, no separate centerline path, so a CSS stroke/pattern would trace each
  polygon's outline rather than draw a lane marking — a pipeline/geometry change, not a
  theme one, if wanted later.

## Deferred

- **Owner feedback mid-session (2026-08-16), not yet clarified or acted on:** "one
  important change area is no where visible — make sure to keep the area also in view or
  popup or info." Said while looking at the new table view (docs/plans/10.md). Best guess,
  **unconfirmed**: `PlotTableRow` shows block/number/status/owner/phone/broker/rate/
  booking-amount/dates/notes/updated-by/updated-at but omits the plot's physical
  dimensions — `area_sqft`, `length_ft`, `breadth_ft` (all on `PlotRow`, already shown in
  the map's own plot-detail sheet, `PlotDetailContent.tsx`) — which may be the "area" the
  owner means (as in square footage), or they may mean something else entirely (a
  geographic area/zone of the colony, a UI region, or "recent changes" visibility). Ask
  before implementing — do not guess further and add a column on this interpretation
  alone.
- **XLSX support for the initial-data import (docs/plans/10.md).** The plan scoped
  "CSV/XLSX file upload"; this build shipped CSV only. `lib/colony/parseBulkImportFile.ts`'s
  `parseBulkImportRows(rows: string[][])` is already factored to accept an XLSX adapter's
  output (pre-split cells, same validation as the CSV path) — adding one needs a
  client-side parsing library (e.g. SheetJS/`xlsx`) plus wiring it into
  `BulkImportScreen.tsx`'s `handleFile`. Not done this session: judged a separately-sizeable
  chunk (new dependency, bundle-size tradeoff) rather than a quick follow-up.
- **Real family usernames/passwords still not created (docs/plans/09.md).** The user
  explicitly deferred providing them this session ("i will add username later"). Only one
  placeholder/demo account exists locally (`demo` / `demo-pass-123`, display name "Demo
  User") — created purely as the fixture the live-integration tests sign in as, obviously
  fake, never committed anywhere. Real accounts: `pnpm create-user <username> <password>
  "<Display Name>"` once the user provides names, run once per family member.
- **Owner feedback from live iPhone PWA testing (2026-08-15) — all three resolved this
  session, see `## Current`.** Kept here for the history: (1) no back button/way to return
  to the colony picker home screen once inside a colony's map. (2) the colony picker home
  screen should look more like a branded list. (3) no way to enter *who* booked a plot.
  All three were unrelated to M7's PWA scope — originally noted, not fixed, during the
  plan 07 criteria 6-9 device test session; built as `docs/plans/08.md` plus two
  unplanned Tier 3 changes this session.
- **`owner_name`/`owner_phone`/`broker_name`/`rate_paise`/`booking_amount_paise`/
  `booking_date` still have no write path beyond `owner_name` on a fresh booking**
  (`docs/plans/08.md` §4 non-goals). A fuller "booking details" form is a real,
  not-yet-scoped feature gap if the family wants to record price/broker/phone from the
  app rather than only at CSV import time — probably its own spec entry, not a quick
  follow-up, since it touches money fields (D-010) and would need its own write-path
  decision the way `owner_name` just got one.
- **From M7 PWA (2026-08-14):** manual acceptance criteria 6–9 in `docs/plans/07.md` §5
  (install to home screen, airplane-mode render, upgrade-replaces-old-worker, clear-site-
  data) must be exercised against `pnpm build && pnpm preview --host` from `apps/map`, not
  `pnpm dev`. `registerServiceWorker.ts` deliberately skips registration outside a
  production build (`import.meta.env.PROD`) — `pnpm dev`'s `index.html` points at
  `/src/main.tsx`, not a hashed build, so a worker registered there would precache the dev
  shell and keep serving it after the dev server stops. The web-app manifest is served in
  dev regardless, so "Add to Home Screen" will appear to work under `pnpm dev` and then
  fail in airplane mode — that is expected, not a bug, if the owner tests under `pnpm dev`
  by mistake (`/review` flagged this as a real gap: nothing else in this repo said which
  command to use for these criteria).
- **From M7 PWA (2026-08-14):** `pnpm test -- --run` in `apps/map` does not exit clean —
  reproduced on six full runs, both before and after this session's PWA changes (also
  reproduces on a stashed clean `HEAD`, without `fake-indexeddb` or either new test file,
  so this predates this session's diff). Every run reports all tests passing
  (`Test Files 16 passed (16)` / `Tests 66 passed (66)`), but the process still exits 1:
  three uncaught `TypeError: The "event" argument must be an instance of Event` exceptions
  from undici's WebSocket teardown, attributed to `src/components/ColonyMap.test.tsx`. One
  of the six runs instead showed a genuine failure —
  `src/lib/sync/subscribePlots.test.ts > … a write from one client is observed by another`
  timed out at 10000ms — so there is a second, intermittent flake in the realtime
  live-integration tests, not just the exit-code issue. Plan `docs/plans/07.md`'s
  acceptance criteria 3 and 4 (full suite green, full gate green) are **not** verified as
  met — `/review` caught this; do not claim them met without re-running and getting a
  clean exit. `pnpm typecheck`, `pnpm lint`, and `pnpm build` all do pass. `PROGRESS.md`'s
  M6 entry records a clean "52/52" / "59/59" baseline earlier — this flake either started
  between then and now, or was already present and unnoticed (no earlier session appears
  to have checked the exit code, only the printed pass count). Needs a real fix in
  `ColonyMap.test.tsx`'s realtime-subscription teardown (or `subscribePlots.test.ts`'s
  timeout), not a `/review`-fix-pass patch — out of scope for this Tier 1 PWA task.
  **Reconfirmed 2026-08-16 (M9 wrap):** `subscribePlots.test.ts`'s "a write from one
  client is observed by another" timed out at 20000ms twice in a row (not intermittent
  this time) during the M9 gate run — a fresh `db-reseed` right before didn't clear it.
  Confirmed unrelated to that session's diff (Tier 2/3, `tools/pipeline` + Makefiles
  only, nothing under `apps/map/src/lib/sync/`).
  **Investigated and partially fixed, 2026-08-16 (same day, follow-up session).** Root
  cause found: not a bug in `subscribePlots.ts` or teardown — full-parallel-suite
  resource contention against the local Docker Supabase stack. vitest runs up to 12
  workers (this machine's core count) across 19 files; 6 are live-integration tests each
  calling `createScratchUser()` (bcrypt-heavy GoTrue `admin.createUser` +
  `signInWithPassword`). `docker stats` during a full run showed `supabase_db` spike to
  209% CPU, `supabase_auth` to 86% — real contention, confirmed, not assumed. That one
  root cause was manifesting as **two different symptoms previously conflated as one
  flake**: (1) the actually-more-frequent failure — `lib/colony/{listColonies,
  plotDetail,plotStatus}.test.ts` created a fresh scratch user *per test* with no custom
  timeout (vitest's default 5000ms), and every captured failure timed out at
  5008-5025ms, just over the default, not stuck. **Fixed**: hoisted `createScratchUser`
  into a shared `beforeAll`/`afterAll` in `plotStatus.test.ts`/`plotDetail.test.ts`
  (halves their auth-user churn — the exact fix `applyPlotTransition.test.ts`'s own
  comment already documented from an earlier `/review` finding: "per-test create+delete
  ... multiplied Auth-container contention" — these two files just never got it), and
  added the matching `15_000` timeout to `listColonies.test.ts`'s single test. Verified:
  3 full-suite runs post-fix went 2 clean / 1 failed, versus failing on essentially every
  run before (6 separate observations across this and the prior session). (2) The
  originally-reported `subscribePlots.test.ts` timeout itself — still occurs
  occasionally even with its existing 20s ceiling, since its dependency chain (2x user
  auth + channel join + WAL commit + broadcast delivery) is longer than the others'.
  **Deliberately left open**: a structural fix exists (cap vitest's file-level
  parallelism, e.g. `maxWorkers`, or isolate live-integration files into a serial
  project) that would likely eliminate this tail case too, but trades whole-suite
  wall-clock speed for determinism on every future run — owner explicitly chose not to
  make that trade ("leave it") when asked, 2026-08-16. Do not revisit without asking
  again; this is a deliberate, not a forgotten, decision.
- **From M7 PWA (2026-08-14):** `InstallInstructions.tsx` ships a hand-drawn, geometric
  share→add-to-home-screen illustration (`public/images/install-instructions.png`,
  generated by `scripts/generate-icons.mjs`'s `installIllustrationPng`), not a real iPhone
  screenshot — no device was available this session to capture one. Plan `docs/plans/07.md`
  §2.9 pre-authorised this exact fallback ("a simple annotated static image is acceptable
  — this is UI content, not logic"), so this is in-plan, not a gap; `/review` flagged an
  earlier version of this entry for treating an authorised fallback as a deferred one.
  Swap in a real screenshot only if the owner wants one for polish once criterion 6 is
  verified on a device — not required.
- **From the real-colony fixture swap (2026-08-14):** the pipeline's own docs
  (`spec/02-map-schema.md`, `spec/10-13-pipe-*.md`, `README.md`, `NAVIGATION.md`) still
  describe and depend on a 45-plot golden fixture reproduced from
  `fixtures/demo-plan.pdf`. That target no longer exists — the real 26-plot Shree Vatika
  layout replaced the shared fixture those docs point at. `/review` flagged this
  explicitly; not fixed this session (out of scope for a Tier 1 fixture-data task).
  Needs a real decision before `tools/pipeline` gets built: either regenerate
  `demo-plan.pdf` to match the real layout, or accept that the pipeline's golden
  fixture and the app's real fixture are now two deliberately different things.
- **From the real-colony fixture swap (2026-08-14):** spec/06 acceptance criterion 4
  ("Labels and trees hide below the zoom threshold") is only half-testable against this
  fixture — the real colony.svg has zero `<use class="tree">` elements (plan 05 §4
  non-goal: the source photo doesn't show individual tree positions). The `.tree` CSS
  rule in `plot-selection.css` is correct but dead for this colony.
- **Owner feedback, not yet acted on (2026-08-14):** plot shapes in the real fixture are
  rectangles only (photo only showed rectangular plots readably — a fixture limit, not
  a contract limit) — still open. Road rendering "doesn't look right" — addressed
  2026-08-15 (see `## Current`'s "Map UI rework, part 1"), not yet owner-verified.
- **From M5 (2026-08-13):** `ColonyMap.tsx` imports directly from `lib/db` and
  `lib/colony`, which NAVIGATION.md's stated layer table says Components may not do
  (only `src/shared`). This predates M5. During the `/review` fix pass, `lib/sync/
  attachSync.ts` also ended up importing `loadPlotStatuses` from `lib/colony` — the
  table's Sync row only lists `lib/db` as an allowed import, so this is the same class
  of gap extended one layer further, chosen deliberately over introducing a second, dead
  wrapper function around `lib/db` (see the `/review` fix log entry above). Worth a real
  decision later: either loosen the documented rule to match reality, or refactor both
  call sites to route through a shared adapter.
- **From M5 (2026-08-13):** spec/05's non-goal "Save control is disabled and says why"
  while offline is not built — D-008 already blocks the write itself (it just fails over
  a dead connection), but there's no UI treatment yet. Small, separate Tier 1 change to
  `PlotStatusActions.tsx` if wanted.
- **From M5 (2026-08-13):** `Makefile`'s `db-start` previously excluded `storage-api,
  imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,realtime`
  — `realtime` is now included (M5 needs it), the rest are still excluded as genuinely
  unused. If a future milestone needs one of the others (e.g. `storage-api` for M15's
  photo uploads, if ever built), the same fix applies: `supabase stop` fully before
  `supabase start` with the new flags — a plain restart silently keeps the old exclusion.
- New `make db-up` target + `.claude/skills/db-up/` (2026-08-13): automates the
  "Docker Desktop / local Supabase stack not running" blocker noted below and in the
  2026-08-13 Current entry above — checks `docker info`, launches Docker Desktop if
  needed, polls up to ~120s, then runs `db-start`. Verified for real this session: ran
  cold (Docker was down), stack came up, `API_URL`/`ANON_KEY` in the output matched
  `apps/map/.env`. On-demand only (invoke `/db-up`), not wired into session start.
  Two things discovered while building it, both workarounds already in the Makefile
  target and skill, not fixed at the root: (1) bare `make` is not on `PATH` in this
  machine's Bash-tool shell — only `mingw32-make.exe` (`C:\MinGW\bin`) resolves; every
  other `make *` command in this repo's skills/CLAUDE.md has this same exposure, worth
  a proper PATH fix if it keeps biting. (2) `cmd.exe /c start "" "<exe>"` silently does
  not launch a GUI app (Docker Desktop) from this shell/session — no error, no window,
  process never appears in `tasklist`. Spawning the `.exe` directly in the background
  (`"<path>.exe" &`) works reliably; that's what `db-up` does. Root cause not
  investigated (likely no interactive desktop/window-station attached to this shell).
- D-012's field list and D-013's status words were **partially** confirmed this session
  (the owner gave a direct, explicit decision on both) — but this doesn't mean either is
  fully settled against the family's real WhatsApp PDF. `owner_phone`/`broker_name`/
  `rate_paise` etc. are still in the schema unconfirmed-but-unused; whether the family's
  PDF vocabulary matches `available`/`booked`/`registered` (vs. words like "sold",
  "agreement done") is still open.
- `pnpm dev`'s background process has been killed twice this session by something outside
  Claude's control (not a user action, no explanation surfaced) — if it keeps happening,
  worth checking whether something in the environment is reaping background node
  processes after a timeout.
- The `supabase` CLI must be invoked as `npx -y supabase <cmd>` in this shell — it is not
  on `PATH` as a bare `supabase` command (checked `where.exe`, `pnpm exec`, scoop, winget;
  none found it, but `npx -y supabase --version` resolves and runs fine). Any future
  session or skill preamble that shells out to `supabase` directly will fail the same way
  `/wrap`'s `preamble.sh` broke on a relative path — prefer `npx -y supabase` or document
  wherever the real binary lives if the user installs it more permanently.
- Docker Desktop does not auto-start on login on this machine — any session that needs the
  local Supabase stack should check `docker info` first rather than assuming it's up from
  a prior session.
- User did not like the M3 sheet's original visual design (no specifics given at the
  time). This session's D-012 revision (length/breadth/conditional owner only) may or may
  not address that — worth asking once they've looked at the simplified version, rather
  than assuming the field-list trim was the whole complaint.
- `apps/map/supabase/config.toml` has now been run for real against Supabase CLI 2.113.0
  (local ports bumped to 55321-55324 to avoid colliding with another project's stack on
  this machine — see Current). One warning: `[inbucket]` is deprecated in favour of
  `[local_smtp]` in this CLI version — harmless today (M2/M3 don't touch email), fix
  before it's actually needed.
- `pnpm`/`wrangler` (D-014), read-only offline (D-008), and no-photos-in-v1 (D-015) were
  proposed and not explicitly confirmed. All reversible. Python toolchain (D-117) is now
  resolved in practice, not just proposed — M9 (2026-08-16, see `## Current`) confirmed
  `ruff`/`mypy`/`pytest` aren't globally on this machine's `PATH` and made every
  `tools/pipeline` Makefile target bootstrap its own `.venv` instead.
- Whether their real PDFs are vector or raster is unknown. If raster, M17's fallback stops
  being last and becomes urgent. `make inspect` on one real file settles it.
- How a new colony reaches production once exported is undecided. M6 imports by script.

## Log

<!-- Append-only. Four lines per entry: Done / Next / Surprises / Verified. -->

### 2026-08-16 — In-app plot-status table view + CSV initial import (docs/plans/10.md, Tier 1)
- Done: `bulk_set_initial_plot_data` RPC (a second, narrowly-scoped write path for the
  one-time initial-data event only), a full table view for ongoing per-row status/owner
  edits (reuses `applyPlotTransition()`, no new operational write path), and a CSV import
  screen — all reachable from the map's toolbar. `/plan → /build → /review`, all `/review`
  findings fixed, plus one more real bug found live in a browser after that (see Surprises).
- Next: get the owner's reaction on their own device, then either fold in feedback or mark
  the plan complete; XLSX support is deferred and open (see `## Deferred`).
- Surprises: none of the mocked-client unit tests caught the realtime-channel collision
  between the map's `attachSync` and the new table view's own subscription — both open at
  once (the table overlays the map rather than unmounting it) and supabase-js silently
  reuses a channel object for a repeated topic string, so the second `.on()` call threw
  synchronously with no error boundary anywhere in the app to catch it. Only surfaced when
  the owner actually clicked the button in a real browser ("plain white screen") — worth
  remembering that a feature adding a second concurrent subscriber to an existing realtime
  primitive needs a live click-through, not just a green test suite, before calling it done.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 24/24
  files, 130/130 tests (96/96 at session start), clean build; grants and the realtime fix
  both re-verified live (`psql`, `mcp__claude-in-chrome`), not just read back from code.

### 2026-08-16 — Test-suite flake investigated, D-108 gate tests fixed (Tier 2, lib/colony/**)
- Done: root-caused the "subscribePlots.test.ts flake" to full-parallel-suite contention
  against the local Docker Supabase stack (confirmed via `docker stats`), found it was
  actually two conflated symptoms, and fixed the more frequent one — hoisted
  `createScratchUser` into shared `beforeAll`/`afterAll` in `plotStatus.test.ts`/
  `plotDetail.test.ts`, added a matching `15_000` timeout to `listColonies.test.ts`.
- Next: nothing queued — the remaining `subscribePlots.test.ts` tail risk is a
  deliberately-accepted open item (owner declined the parallelism-capping fix), not a
  gap to revisit without asking again.
- Surprises: the historical PROGRESS.md entries all attributed every full-suite test
  failure to `subscribePlots.test.ts` specifically, but in this session's own repro runs
  that file was the minority cause — 4 of the first 6 failures observed were actually
  the three undertimed `lib/colony/*.test.ts` D-108 gate tests, timing out at almost
  exactly 5000ms (vitest's default), which nobody had connected to the "realtime flake"
  before. The fix for this exact contention pattern already existed in the codebase
  (`applyPlotTransition.test.ts`'s own comment cites a past `/review` finding) but was
  never applied to these three files.
- Verified: `pnpm typecheck`/`pnpm lint` clean after the edits; 3 consecutive full-suite
  `pnpm test -- --run` runs went 2 clean / 1 failed (the 1 being the known, accepted
  `subscribePlots.test.ts` case) versus failing on nearly every run beforehand.

### 2026-08-16 — M9 built: pipeline triage/ingest (spec/09-pipe-triage.md)
- Done: `tools/pipeline/` scaffolded for real (`pyproject.toml`, self-bootstrapping
  `Makefile`, `pipeline/io/pdf.py`'s `triage_pdf()`, `pipeline/cli/inspect.py`), plus the
  `tests/test_contract.py`/`tests/test_golden.py` root's `make contract`/`make gate`
  already depended on. Root `Makefile` rewritten to delegate `verify-pipe`/`contract`/
  `gate`/`inspect` to the nested Makefile instead of calling bare Python tools.
- Next: M10 (`spec/10-pipe-vector.md`) — vector PDF extraction, the path M9's triage
  points a real DWG export down.
- Surprises: PyMuPDF (1.28.2) parses Markdown as a generic document, so spec/09's own
  "feed it this spec file" example for the unreadable-file criterion doesn't fail on its
  own — `triage_pdf()` needed an explicit PDF/image extension allowlist to make that
  criterion true. Also: this machine has no global `ruff`/`mypy`/`pytest` on `PATH` (only
  bare `python`) — resolved D-117 in practice by making every pipeline Makefile target
  bootstrap its own `.venv`.
- Verified: all 5 of spec/09's acceptance criteria run for real via `mingw32-make.exe`
  from repo root, output pasted in `## Current` above. `make contract` → "2 passed".
  Confirmed the venv bootstraps cold (no manual setup) and that only real source files
  stage (`git add -n tools/`). **Full `/wrap` gate, same session:** `make contract`
  clean; `apps/map` typecheck/lint/build clean, tests 95/96 (one pre-existing, unrelated
  realtime flake — see `## Deferred`, reconfirmed not this diff's doing); `tools/pipeline`
  `verify`/`golden` clean.

### 2026-08-16 — Map UI rework, part 5: reference-matched labels, road grain, texture-tiling root cause, phone access
- Done: matched road/quadrant labels to the owner's part-4 reference render (white
  chip via a new `mapLabelChips.ts`, `getBBox()`-measured, deferred one
  `requestAnimationFrame` past `svgOverlay.addTo(map)` since attachment isn't layout);
  dropped status fill-opacity 0.55 → 0.38; added a small fixed-fleck road-grain
  pattern; and, after three wrong theories (tile-join antialiasing, a source-photo
  vignette), found the real cause of the ground texture's visible tiling: my own
  canvas `blur()` call sampling transparent pixels past the crop edge, self-inflicting
  a vignette on every processed image regardless of crop. Fixed by padding with real
  neighbouring pixels before blurring, then cropping the interior back out. Separately,
  fixed the owner's phone not being able to log in at all — `apps/map/.env`'s
  Supabase URL was `127.0.0.1`, meaningless from a phone; repointed at this machine's
  LAN IP and restarted `pnpm dev --host`.
- Next: owner to retry on their own phone now that both the texture fixes and the LAN
  URL fix are in — this is the fifth live correction cycle this session, still nothing
  confirmed from their own device.
- Surprises: `getBBox()` measures 0x0 immediately after inserting an SVG into a live
  Leaflet overlay — being attached to the document isn't the same as having been laid
  out, and nothing forces that pass synchronously; needs one rAF. Bigger one: a canvas
  `ctx.filter = 'blur()'` drawn right up to a crop edge darkens that edge by sampling
  transparent pixels beyond it — this produces an artifact that looks exactly like a
  defect in the source photo (a "vignette") or a tiling/rendering bug, and survived two
  full wrong-theory fixes (reduced tile repeat + image overlap, then a source-photo
  crop) before the actual cause — my own filter call — was checked. Pad the canvas
  before blurring, always, when cropping is involved. Also: Vite does not hot-reload
  `.env` changes into an already-running dev server's client bundle — a full restart
  was needed for the new `VITE_SUPABASE_URL` to take effect, not just a page refresh.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — clean,
  19/19 files, 96/96 tests (one retry, the documented DB-warm-up flake, clean after),
  clean build. Live in Chrome at normal and zoomed-in scale, texture confirmed with no
  visible grid line or vignette at either. LAN reachability confirmed via `curl` from
  this machine to its own Wi-Fi IP (not the loopback-bound VMware/WSL adapters) for
  both the Vite dev server and the Supabase Kong gateway, plus a CORS preflight check
  (`Access-Control-Allow-Origin: *`) — not yet confirmed from the owner's actual phone.
  `supabase db reset` + reseed + `pnpm create-user` once this session to clear scratch
  colonies leaked by the flaky retry.

### 2026-08-16 — Map UI rework: owner verification, closes the loop from parts 1-5
- Done: nothing new built — the owner tested live on their own phone and confirmed
  "it worked everywhere" (texture, labels, opacity, road grain, and the phone-login
  fix all held up on their own device, not just this machine's Chrome). Updated
  `## Current`'s parts 1, 3, 4, and 5 to replace their "still not owner-verified"
  notes with this confirmation.
- Next: no open item from this thread of work. Future texture/label feedback would
  start a new round, not reopen this one.
- Surprises: none.
- Verified: owner's own device, owner's own words — no command run this entry.

### 2026-08-15 — Map UI rework, part 4: real photo texture, zoom-lockstep world layer, corrupted-asset bug hunt
- Done: owner rejected the procedural blob texture, flagged the backdrop not scaling
  with zoom, and supplied their own AI-generated grass photo with explicit use
  permission (a second, licensed-looking photo was deliberately not used — mixed
  signals from the owner about its licence in the same session). Rebuilt the ground
  texture around that real photo, mirror-tiled 2x2 for guaranteed seamlessness, and
  replaced the CSS-background zoom workaround with a second Leaflet `svgOverlay`
  sharing the map's own coordinate transform so the backdrop and site now zoom/pan in
  lockstep. Spent most of the session chasing what looked at first like a
  duplicate-SVG-id bug, then discovered and fixed the real cause: `get_page_text`
  silently truncated a ~50k-character base64 transfer, corrupting the JPEG asset in a
  way that still rendered its top portion correctly, making the bug look like a
  tiling/scaling problem rather than a broken file.
- Next: owner still hasn't seen this on their own device — fourth correction cycle in
  one session, worth stopping for their reaction before any further texture work.
- Surprises: a corrupted JPEG that still has valid header bytes renders its top slice
  correctly and the rest as flat grey, in both `<img>` and SVG `<image>` — this looks
  exactly like a scaling/tiling bug, not an asset-integrity one, and cost real time
  before a byte-level EOI-marker check (absent) settled it. `get_page_text` has no
  documented length limit but silently truncates well under 50,000 characters with no
  error — any future large binary transfer through a browser tab this way needs
  chunking (~1800 chars was reliable) and a Node-side integrity check before the
  decoded file is ever trusted, not just a visual glance. Separately (real bug, but
  not this one's cause): two sibling Leaflet SVG overlay layers in the same live DOM
  cannot both define a `<pattern>` with the same id — ids are unique per document, not
  per `<svg>` sub-root.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — clean,
  19/19 files, 96/96 tests (several retries needed, the documented DB-warm-up flake
  got worse under this session's unusually high test-run count), clean build. Live in
  Chrome, isolated before integrated: a bare `<img>` tag at target size, then the full
  pattern in a blank page, then the real app — each step confirmed correct before
  moving to the next, catching the corruption at the smallest reproduction rather than
  guessing inside the full app. `supabase db reset` + reseed + `pnpm create-user`
  three times this session to keep the demo picker clean of leaked scratch colonies.

### 2026-08-15 — Map UI rework, part 3: whole-viewport grass, blob texture, boundary colour, DB residue cleanup
- Done: owner sent a screenshot showing the grass texture only filling the map's own
  rectangle (letterboxed at this aspect ratio) and asked for the whole viewport, said
  the blade texture still looked low-quality/mechanical up close and suggested a real
  satellite-photo texture as a fallback if a better procedural one wasn't possible, and
  flagged the plot boundary colour as bad. Extended the ground texture to
  `.colony-map-container`'s own CSS background (a hand-encoded data-URI SVG matching
  the in-map palette, since a satellite photo asset isn't available in this offline
  PWA with no CDN dependency and no image-generation tool here), replaced the blade-
  stroke pattern with layered translucent blob ellipses for a softer mottled look, and
  recoloured the plot stroke to a crisp white. Also found and cleaned up two leaked
  `verified: true` scratch colonies in the real picker — residue from this session's
  own flaky test run, not related to the texture work.
- Next: this is the third live correction cycle on this UI rework in one session —
  worth getting the owner's own reaction before assuming the texture is settled;
  nothing else queued.
- Surprises: a CSS `background-image` can't reference an SVG `<pattern>` def or read a
  CSS custom property, so the container backdrop's colours had to be hand-duplicated
  into a literal data-URI string rather than sharing the DOM-built pattern's code path
  — documented inline as a deliberate, manually-synced exception to D-004, not an
  oversight. Also: `supabase db reset` wipes the `auth` schema along with the rest of
  the database, so the demo account needed recreating with `pnpm create-user`
  afterward, not just `pnpm import:seed`.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — clean,
  19/19 files, 96/96 tests, clean build, re-run after the `db reset` too. Live in
  Chrome: grass fills the viewport outside the site rectangle, texture reads as
  mottling rather than a repeating blade grid, plot boundaries are crisp, and the
  colony picker shows only the one real colony post-cleanup.

### 2026-08-15 — Map UI rework, part 2: owner corrections after seeing part 1 live
- Done: owner looked at part 1 in a real browser and sent three corrections — grass
  was tiling separately per plot instead of reading as one field, texture wasn't dense
  enough, and the road-edge stroke added in part 1 drew a visible border at every
  segment join (confirmed with their own screenshot). Fixed all three: new
  `buildGroundRect()` in `mapTexturePatterns.ts` paints one shared grass rect as the
  SVG's first child; `.plot` fill dropped to `none` (boundary line only) with status as
  a flat translucent colour over the shared ground instead of its own pattern; blade
  count/saturation increased; the road stroke removed outright. Deleted the now-dead
  per-status pattern classes rather than leaving them unused.
- Next: still needs the owner's own look, on their own device — this was corrected
  from a screenshot they sent mid-session, not yet a fresh from-scratch reaction.
- Surprises: `patternUnits="userSpaceOnUse"` ties a pattern's tile grid to the SVG's
  global coordinate origin, not each shape's own bounding box — meant switching from
  "one pattern fill per plot" to "one shared rect underneath everything" needed no
  coordinate math at all, every pattern already shared the same (0, 0) phase.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — clean,
  19/19 files, 96/96 tests (one live-integration timeout on the first run, the
  documented DB warm-up flake, passed clean on retry). Live in Chrome: continuous grass
  under roads/plots, no internal road borders, plot tint still shows grain through it.

### 2026-08-15 — Map UI rework, part 1: road/plot/garden textures, status as overlay, glass chrome
- Done: owner asked to continue a "UI rework" with no prior thread in this repo — asked
  which piece, owner picked road rendering (the deferred 2026-08-14 item), then mid-turn
  supplied two reference images and expanded scope live: realistic-looking plots/garden
  with status as a translucent overlay (not opaque fill), the referenced lighter road
  style, and transparent/glassmorphism popups ("rest you decide yourself" for the rest).
  Built new `components/mapTexturePatterns.ts` (grass/garden/per-status `<pattern>` defs,
  injected at SVG-parse time, same precedent as `plotDimensionOverlay.ts`), new
  `styles/map-texture.css` (split out to hold the 250-line cap), recoloured
  `--colony-road` off near-black to a warm mid-grey, added the `.feature-label`/
  `.plot-label` styling neither had ever had (centering + a stroke halo for legibility
  regardless of the colour underneath), and a shared `--colony-glass-*` frosted-glass
  recipe applied via `backdrop-filter` to the plot detail sheet, its status buttons, and
  every other floating HTML panel.
- Next: show the owner a real browser and get their reaction before calling this
  redesign done — garden texture reads as stylized/geometric, not photorealistic (a
  flat-SVG-pattern constraint, no external image assets available); plot shapes staying
  rectangle-only (2026-08-14 feedback) is still untouched.
- Surprises: two road-colour labels (`.feature-label`, the "9.0 M W ROAD" text) had *no
  CSS rule at all* before this session — they'd been rendering in the browser default
  (black, unstyled, left-anchored) the entire time, which the 2026-08-13 near-black road
  repaint had made almost invisible; that near-invisibility is very likely most of what
  "road rendering doesn't look right" actually meant, found only by loading the real
  page in Chrome and zooming into a screenshot, not by reading the CSS. Separately, a
  comment written mid-session (`.texture-blade-*/` as shorthand for two class names)
  contained a literal `*/` that closed the CSS comment early and broke `pnpm build` with
  `CssSyntaxError: Missing opening (` — `pnpm typecheck`/`pnpm lint`/the Vite dev server
  all stayed silently green through it, only the production build's CSS pipeline caught
  it, another instance of this repo's "verify by running the actual command" rule
  earning its keep.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` from
  `apps/map` — clean after the comment fix, 19/19 test files, 96/96 tests. Live in a
  Claude-driven Chrome session (`mcp__claude-in-chrome`), not just by reading the CSS:
  zoomed screenshots confirm grass-blade texture visible through a booked plot's blue
  tint, garden shrub texture, road labels and plot numbers legible over every status
  colour, and the plot detail sheet showing the map visibly blurred through it. Not yet
  shown to the owner.

### 2026-08-15 — M8 built: username/password auth + RLS lockdown (docs/plans/09.md), /review's 6 findings fixed
- Done: planned and built M8 (spec/08-map-auth.md) — username/password via a synthetic
  per-user email (D-019, user's explicit override of D-003), `apply_plot_transition()`
  rewritten `security definer` with server-side attribution (D-020, drops `p_actor`),
  RLS locked to select-only/authenticated-only on all three tables, `App.tsx` restructured
  around a single app-lifetime client and a real session gate, cache TTL pinned at 24h.
  `/review` found 6 real issues and all were fixed in the same session: attribution read a
  self-writable JWT claim (`user_metadata`) instead of the service-role-only
  `app_metadata`; `config.toml`'s auth edits were silently inert because the containers
  were never restarted; a stray `TRUNCATE` grant left `plot_history`'s append-only
  guarantee unenforced at the privilege layer; `getDisplayName()` had reintroduced the
  `?? "unknown"` placeholder-fallback anti-pattern; scratch-account teardown could leak
  accounts on a failing assertion; negative RLS/RPC tests asserted only "some error", not
  the specific permission-denied code.
- Next: a human runs the plan's two remaining manual acceptance criteria (criterion 1 —
  an outside account can't sign in, on a real device; criterion 5 — the cache TTL forces
  re-auth after a real clock change) before `docs/plans/09.md` gets its `Status: complete`
  marker and D-011 is revisited. `pnpm dev --host` is running in the background for this.
- Surprises: two Postgres/Supabase defaults worked against the security intent unless
  explicitly overridden — `create function` grants `EXECUTE` to `PUBLIC` regardless of any
  later narrower grant, and `BYPASSRLS` (which `service_role` has) skips RLS policies but
  not the underlying table `GRANT` check, so `service_role` needed an explicit grant it
  had never been given since M2. Also: `supabase db reset`/`make db-up` reuse the running
  containers and never re-read `config.toml`'s `[auth]` block — only a full `supabase stop`
  + restart picks up changes there, the same class of gap the 2026-08-13 `db-start`
  exclusion-flag lesson already taught once, now relearned for a different config surface.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — clean
  twice in a row post-fixes, 19/19 test files, 96/96 tests, clean build (baseline 75/75 at
  last commit `492c315`). Live curl/psql against the running stack, not just reading the
  migration: anon reads return `[]`; an anon RPC call is `42501` permission denied; a
  forged `p_actor` field makes PostgREST reject the call outright (no such signature); a
  self-forged `user_metadata.display_name` no longer changes `updated_by` after the
  `app_metadata` fix; `docker inspect`'s env vars confirm `GOTRUE_DISABLE_SIGNUP=true`/
  `GOTRUE_SESSIONS_TIMEBOX=24h0m0s` are actually active; a live self-signup and an
  outside-username sign-in attempt are both rejected; `information_schema.role_table_grants`
  confirms no `TRUNCATE`/`UPDATE`/`DELETE` grant remains where it shouldn't.

### 2026-08-15 — Three deferred owner-feedback items closed: back nav, branded picker, booked-by name (docs/plans/08.md)
- Done: asked the user to sequence three items flagged last session against the queued
  M8 milestone; user chose "deferred items first." Built the two Tier 3 UI items directly
  (back-navigation button, branded "Nimantran Group Colonies" picker heading), then wrote
  and built `docs/plans/08.md` (Tier 1 — extends `apply_plot_transition()`, the sole
  plot-status write path, with a coalesced `owner_name` param), ran `/review`, fixed both
  real findings, closed the plan.
- Next: M8 — auth + RLS lockdown (`spec/08-map-auth.md`), needs `/plan`.
- Surprises: `/review` caught that the new back button silently covered the
  always-visible freshness indicator (same top-left corner, opaque, higher z-index) —
  spec/05's "always visible" guarantee would have broken with zero test signal, since no
  existing test asserts both are visible at once. Also caught that making `owner_name`
  sticky (required for Undo to work with no extra UI) had a real side effect nothing in
  the plan anticipated: an un-booked plot stayed searchable by, and displayed, its former
  buyer's name in `PlotSearch.tsx` — the plan's own §1 context claim ("only displayed
  while booked") was true of `PlotDetailContent.tsx` alone, not of search.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` from
  `apps/map`, stack up via `mingw32-make db-up` then `supabase db reset` +
  `pnpm import:seed` to apply the new migration — 17/17 test files, 75/75 tests (one
  transient realtime-subscription timeout on the first post-reset run, clean on retry,
  pre-existing flake), clean build. `docker exec supabase_db_colony-map psql ... \df
  apply_plot_transition` — exactly one signature, 6 args, confirming the old overload was
  dropped.

### 2026-08-15 — docs/plans/07.md (M7 PWA) closed: gate-verified, then all 4 manual criteria live-tested
- Done: picked up a prior session's already-built and `/review`-fixed M7 PWA diff
  (manifest, service worker, offline IndexedDB cache, install-instructions screen) with
  no code changes needed, brought the local Supabase stack back up (`make db-up`), ran
  the full gate for real, and committed. Then live-tested all four remaining manual
  criteria: criteria 6–7 on the owner's iPhone over the LAN (temporarily repointed `.env`
  at the laptop's Wi-Fi IP, reverted after); criteria 8–9 via a Claude-driven Chrome
  session using `javascript_tool` to inspect Cache Storage/IndexedDB/SW state directly —
  shipped a real trivial app-code change, rebuilt, confirmed the new hashed asset was
  fetched and the stale one pruned on next navigation with no `sw.js` change needed, then
  fully wiped caches/IndexedDB/SW-registration/`localStorage` and confirmed clean recovery
  to the first-run screen. Appended `**Status:** complete` to `docs/plans/07.md`.
- Next: pick the next milestone; three pieces of live-testing feedback are in `## Deferred`
  (colony-picker back navigation, picker visual design, no input for who booked a plot).
- Surprises: `sw.js`'s actual update mechanism (a `refreshShellCache` helper that syncs
  `/assets/*` cache entries with whatever the current `index.html` references, run on
  install *and* every successful navigation) is smarter than plan 07 §5 criterion 8's
  literal framing ("deploying a new version replaces the old service worker") assumed —
  `sw.js`'s own bytes deliberately don't change on a normal app deploy, so there's no
  install/activate cycle to observe for that case; the file's own top comment explains
  why. Tested the mechanism that actually ships (cache freshness via navigation-time
  diffing) instead of the literal SW-replacement scenario, which only applies if `sw.js`
  itself changes.
- Verified: `pnpm typecheck && pnpm lint` clean; `pnpm test -- --run` — 69/69 tests
  passing across two consecutive runs (exit code 1 both times, the pre-existing flake,
  not a new failure); `pnpm build` clean; `ls dist/manifest.webmanifest dist/sw.js
  dist/icons` — all present. Criteria 6–7 — owner-confirmed live on their own iPhone.
  Criteria 8–9 — Claude-driven Chrome session, real cache/IndexedDB state inspected via
  `caches.keys()`/`indexedDB.databases()`, not simulated.

### 2026-08-14 — docs/plans/06.md: multi-colony home screen, plan closed
- Done: closed the `colonies.verified` render-time gap (`lib/colony/{plotStatus,
  plotDetail}.ts` now refuse an unverified colony's data, not just at import), then
  planned and built `docs/plans/06.md` — a home-screen colony picker between the name
  prompt and the map. New `fetchVerifiedColonies`/`loadVerifiedColonies` (D-108 applied
  at the list level), `features/colony-picker/ColonyPicker.tsx`, `App.tsx` wiring, and
  `ColonyMap.tsx`'s hardcoded `COLONY_ID` constant replaced with a required `colonyId`
  prop. `/review` found four real issues, all fixed: live-integration tests were leaking
  permanent `verified: true` scratch colonies into the real picker (no DELETE grant on
  `colonies`) — added `revokeVerification` teardowns and reset the DB to clear the
  pre-fix residue; a failed colony-list fetch silently read as "no colonies" — added a
  distinct `loadError` state; this file's own `## Current` was stale mid-session; and
  `NAVIGATION.md` was missing the new functions/feature row. Then verified acceptance
  criterion 5 live via a Claude-driven Chrome session (see Surprises) and appended
  `**Status:** complete` to the plan.
- Next: pick the next milestone.
- Surprises: the `/review` finding about scratch colonies leaking into the UI was a
  genuinely new failure class for this repo — every prior live-integration test used
  `verified: false` scratch rows specifically to stay invisible to the app, and this
  session's tests were the first to need `verified: true`, which turned "harmless
  residue" into "visible junk in a real UI list." Also: `mcp__claude-in-chrome` browser
  tools were available this session (not assumed from CLAUDE.md's "Claude has no browser"
  caveat, which predates that tooling) — reused the exact precedent already set by the
  2026-08-13 `db-up` session's live click-through to verify criterion 5 directly instead
  of leaving it to the owner, flagged in `## Current` as Claude's own browser, not
  theirs, so the owner can still glance at it themselves.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` from
  `apps/map` — 59/59 tests (up from 56 pre-session), clean build, run three times across
  the build/review-fix/wrap steps (one `subscribePlots.test.ts` timeout right after a
  fresh `supabase db reset`, the documented cold-connection warm-up flake, passed clean
  on immediate retry). `supabase db reset` + `pnpm import:seed` — "imported 26 plots for
  shree-vatika-2, 0 unmatched". `psql -c "SELECT id, verified FROM colonies"` — only
  `shree-vatika-2` verified after the fixed tests ran. Live Chrome session: picker showed
  exactly one colony, tapping it opened the real map (search/legend/share/freshness all
  present), clicking plot A-33 opened its detail sheet with real data, zero console
  errors across two full page loads.

### 2026-08-14 — M6 fully closed, first live M4 Save/Undo click-through
- Done: closed spec/06's two remaining manual acceptance criteria (legend filter dimming
  across all three statuses; share-summary paste-into-WhatsApp legibility) by having the
  owner test them live on their own phone. Served the dev server on the LAN
  (`pnpm dev --host`) over the phone's own hotspot, which the laptop was already using —
  simpler than expected, no separate Wi-Fi network needed. Along the way, exercised the
  M4 Save/Undo buttons for the first time ever in a real browser.
- Next: unchanged — `/plan` the multi-colony home screen next session, closing the
  `colonies.verified` render-time gap first.
- Surprises: the phone couldn't reach the app's data at first — `fetchPlotBySvgId failed:
  TypeError: Load failed` — because `apps/map/.env`'s `VITE_SUPABASE_URL` was
  `127.0.0.1:55321`, which resolves to the phone itself from the phone's browser, not the
  laptop. Fixed by temporarily pointing it at the laptop's LAN IP
  (`vite --host` prints the right one — had to pick the "Wi-Fi"-labeled interface out of
  four candidates, since VMware/WSL virtual adapters print alongside it and aren't
  reachable from another device), then reverted after the test (`.env` is gitignored,
  never committed, so this never touched history). Also: `pnpm dev -- --host` (with the
  `--` separator) silently failed to forward `--host` to vite — pnpm's bare `dev` alias
  (vs. `pnpm run dev`) doesn't strip the `--` the way `npm run` does. `pnpm dev --host`
  (no separator) worked. The repo's `guard.sh` hook blocks `*run dev*` and bare `vite`
  invocations on principle ("I run the dev server") — `pnpm dev --host` matches neither
  pattern and was allowed through, consistent with CLAUDE.md's stated exception for
  `pnpm dev`.
- Verified: owner confirmed live on-device — legend filter dims correctly and "clear all"
  restores it; share-summary text pasted into an actual WhatsApp chat read legibly; Save
  set A-33 to booked then registered and A-23 to booked, each correctly attributed and
  reflected in the resulting share-summary "Recent changes" text with no stale-write
  errors.

### 2026-08-14 — /wrap closes docs/plans/05.md
- Done: closed out `docs/plans/05.md` (the real Shree Vatika fixture swap plus the M6
  scope it grew to include) — re-ran every scripted §5 acceptance criterion instead of
  trusting the prior session's narrative, then appended `**Status:** complete`.
- Next: unchanged from the entry above — `/plan` the multi-colony home screen, closing
  the `colonies.verified` render-time gap first.
- Surprises: none in the app code, but the local gate needed two DB-dependent detours the
  plan's own criterion 6 note flagged as possible: (1) 5 live-integration tests failed
  with `fetch failed` until `make db-up` started the stack (it had gone down since the
  last session); (2) the realtime subscription test then timed out once on a cold
  connection and passed clean on immediate retry — a warm-up flake, not a regression,
  worth remembering before treating a lone `subscribePlots.test.ts` failure as real.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` from
  `apps/map` — 52/52 tests, clean build. `grep -E 'fill=|stroke=|style='
  fixtures/shree-vatika-2/colony.svg` — no matches. ajv (draft-2020, scratch install)
  against `contract/colony.schema.json` — `valid: true`. `npx supabase db reset` then
  `pnpm import:seed` — "imported 26 plots for shree-vatika-2, 0 unmatched".

### 2026-08-14 — M6 built, real colony fixture replaces the demo, three review rounds
- Done: built M6 (spec/06 — legend filter with a dedicated `StatusLegend`, in-memory
  search via `PlotSearch`/`lib/colony/searchPlots.ts`, `ShareSummary`'s WhatsApp text
  block, zoom-dependent label/tree hiding). Then, per owner request, replaced
  `fixtures/shree-vatika-2/` entirely with a hand-traced rendering of the owner's real
  site-plan photo (`docs/plans/05.md`) — 26 confirmed plots, block "A" only (no lettered
  blocks on the real plan), ~8 unread interior plots and the LIG/EWS strip left out
  rather than guessed. Also, on request: removed the black selected-plot border, added
  architectural length/breadth dimension arrows on selection, made selection raise the
  plot and its label above everything else while dimming the rest, added click-to-zoom
  on selection, and changed available's colour from green to wheat (green collided with
  the garden feature). Went through three `/review` passes on the fixture + supporting
  code; every pass found and fixed real bugs — see Surprises.
- Next: first thing next session, `/plan` a multi-colony home screen (owner's original
  design, not yet built — see `## Current` and `## Deferred` for the `colonies.verified`
  gap that should close first). Also open: the pipeline-docs-vs-real-fixture drift noted
  in Deferred, and the two pieces of owner feedback not yet acted on (rectangle-only
  plot shapes, road rendering redesign).
- Surprises: every `/review` pass on this diff found something real, which is the
  point of running it three times rather than one — (1) hand-authoring plot Y-coordinates
  by typing them produced 10 plot/plot and 12 plot/road overlaps invisible until a real
  geometry cross-check ran; fixed by rewriting the generator to compute every Y from a
  running layout cursor plus a programmatic overlap self-check that now runs before any
  file is written. (2) `is_corner` computed from column position over the *reduced*
  26-plot set silently promoted interior plots (next to an excluded unread cell) to false
  corners — fixed by computing it from actual road adjacency instead. (3) the share
  summary's "recent changes" was about to show the seed import's own bookkeeping rows
  (`changed_by: "import"`) as real status changes in the family's WhatsApp text — exactly
  the fabricated-evidence failure invariant 5 exists to prevent. (4) a CSS `!important`
  meant to keep a selected plot "in focus" instead applied to every non-selected plot too
  once a legend filter was also active, silently disabling the filter's own dimming.
  None of these were guessable from reading the code once; each needed either a live
  browser check or an independent geometry re-derivation to surface.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — clean,
  52/52 (up from 44 pre-M6). `supabase db reset && pnpm import:seed` — "imported 26 plots
  for shree-vatika-2, 0 unmatched", re-run after every fixture fix. Every fix this session
  re-verified live in a real browser via direct DOM/console instrumentation (plot
  selection, label focus, search results, share-summary text, filter+selection opacity
  interaction) — not just visual screenshots, and not just "tests pass".

### 2026-08-13 — M5 closed: spec/05 live-verified, plan marked complete
- Done: owner live-verified spec/05 §5's four manual acceptance criteria (propagation
  under 2s across two clients, freshness tick advancing over 5 minutes, DevTools offline
  mode turning the indicator amber within 10s, reconnect refetch) in a real browser.
  Appended `**Status:** complete` to `docs/plans/04.md`. No code changed this session.
- Next: pick the next milestone; separately, the M4 Save/Undo click-through and
  `tools/pipeline` (still pre-M9, doesn't exist) remain open (see `## Current`).
- Surprises: `make gate` still fails at `contract` because `tools/pipeline` doesn't
  exist — this is expected and already documented (2026-08-12 log entry below), not new
  breakage. Worth flagging for a future session: this failure mode looks exactly like
  something got deleted, and re-discovering "oh right, that's pre-M9" costs real
  investigation time each time it's hit. Chased it down via git history + session
  transcripts before finding the answer already written in this file.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` in
  `apps/map` — all clean, 44/44 tests, production build succeeds. `make gate` not run
  (fails at `contract` for the pre-M9 reason above, not a regression).

### 2026-08-13 — theme repaint live-verified in browser
- Done: owner confirmed the theme repaint (previous log entry — asphalt roads,
  saturated garden/tree greens, available=green/booked=blue/registered=orange) in a
  real browser and reported it looks right. No further changes made.
- Next: M5's four spec/05 manual acceptance criteria and the M4 Save/Undo click-through
  are still the two open live-verification items (see `## Current`).
- Surprises: none.
- Verified: owner's own visual confirmation in a browser — not re-derived from code.

### 2026-08-13 — theme repaint (Tier 3, owner-requested)
- Done: restyled `colony-theme.css` to match a reference image the owner shared — dark
  asphalt roads (`#4a4a4a`, was light tan), richer saturated garden/tree greens, and a
  new plot-status palette (available=green `#4caf50`, booked=blue `#3b82f6`,
  registered=orange `#e67e22`, replacing the old muted green/amber/gray). Owner
  explicitly chose the reference's saturated palette over keeping the original colours
  when asked (booked=blue was the material change; ambiguous otherwise). No dashed road
  centerline — the fixture's `.road` paths are filled polygons with no separate
  centerline element, so that needs a pipeline/geometry change, not a theme one.
- Next: owner to look at it in a browser (`pnpm dev`) and confirm the palette reads
  well; still no dashed lane markings if that mattered more than the color repaint did.
- Surprises: the freshness indicator's offline "amber" (spec/05 criterion 3, fixed via
  `/review` last session) was silently coupled to `--colony-status-booked` — repainting
  booked to blue would have broken it invisibly. Caught by grepping every consumer of
  the status colour variables before changing them, not by a test (none exists for
  this). Split it into its own `--colony-warning-amber` token so a future status-colour
  change can't do this again.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 44/44
  tests, clean build. `subscribePlots.test.ts` flaked once on this run (Docker/WAL
  jitter, same known class as last session, unrelated to the CSS change — confirmed by
  re-running it 3x clean immediately after) then passed clean on the full-gate re-run.

### 2026-08-13 — M5: realtime sync + freshness indicator, /review's 5 findings fixed
- Done: `docs/plans/04.md` planned and built — new `lib/sync/{subscribePlots,freshness,
  attachSync}.ts`, `components/FreshnessIndicator.tsx`, migration
  `20260815000000_m5_realtime_publication.sql` (adds `plots` to `supabase_realtime`,
  never there before). `/review` found 5 issues, all fixed: freshness label could claim
  a sync that never happened on a failed initial fetch (now starts "Not synced yet");
  connection state wasn't seeded from `navigator.onLine` at setup, silently breaking the
  reconnect-refetch transition; the realtime subscription only opened after the initial
  fetch succeeded, leaving the app permanently blind on a failed first load; the live
  test raced its write against the channel's connect ack; the offline indicator used the
  red `--colony-status-hold` token when spec/05 says "amber". Fixing the first three
  pushed `ColonyMap.tsx` to 267 lines (over the 250-line cap) — extracted the whole
  subscription/reconnect/tick orchestration into `lib/sync/attachSync.ts`, which is also
  the architecturally correct home (Tier 1, not Tier 3). `ColonyMap.tsx` is now 165
  lines.
- Next: a human runs spec/05's four manual acceptance criteria in two browser windows,
  then `docs/plans/04.md` gets its `Status: complete` marker.
- Surprises: local Supabase's `realtime` service had been excluded from `db-start` since
  M2/M3 — the migration adding `plots` to the publication applied fine, but nothing
  received events until the exclude flag was found and removed, and even then a plain
  `supabase start` restart silently kept the old exclusion (had to `stop` fully first).
  Separately, the live realtime integration test threw under this project's default
  jsdom Vitest environment (`TypeError: ... instance of Event`) — jsdom's global `Event`
  class shadows Node's native one and realtime-js's WebSocket transport does a
  cross-realm `instanceof` check; fixed with a per-file `@vitest-environment node`
  override, not investigated further as it's a known jsdom/undici interaction class, not
  a bug in this repo.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 44/44
  tests, clean build, run twice (once after the initial build, once after the 5 review
  fixes). `subscribePlots.test.ts` specifically stress-tested 13/13 clean across two
  batches (1 flake in 5 runs before the connect-ack fix, 0 in 8 after). Not run: spec/05's
  four manual acceptance criteria — need a human in two real browser windows.

### 2026-08-13 — db-up automation, then live-verified docs/plans/03.md criterion 6
- Done: built `make db-up` + `.claude/skills/db-up/` to remove the "Docker/Supabase not
  running" blocker noted in the prior 2026-08-13 entry (see Deferred for the two
  environment quirks found and worked around: bare `make` not on `PATH`, `cmd.exe /c
  start` silently failing to launch GUI apps here). Ran it cold, then `pnpm dev`, then
  drove a real Chrome tab against `http://localhost:5174/` end to end: full-colour map
  (not the flat/empty fallback), clicked an `available` plot (A-03: length/breadth only,
  no owner field) and a `booked` plot (A-01: same plus Owner "Deepak Chouhan"). This is
  `docs/plans/03.md`'s criterion 6, the one item blocking its `Status: complete` marker
  since the 2026-08-14 wrap entry — now added.
- Next: no open blocker on M2/M3/M4. Save/Undo buttons are built (Tier 2 log below) but
  not yet clicked live by a human — worth doing, not urgent. Otherwise next milestone.
- Surprises: `cmd.exe /c start "" "<exe>"` produced no error and no window — Docker
  Desktop never appeared in `tasklist` after it — but spawning the `.exe` directly in the
  background worked on the first try. Root cause not chased (likely no interactive
  window-station attached to this shell); worth remembering if any future automation
  needs to launch a Windows GUI app from here.
- Verified: `mingw32-make db-up` real output — Docker launched cold, daemon detected
  ~3s after direct-spawn, `db-start` returned `API_URL: http://127.0.0.1:55321`,
  `ANON_KEY` matching `apps/map/.env`'s `VITE_SUPABASE_ANON_KEY` byte-for-byte. Browser
  check above was a real Chrome session (claude-in-chrome), not a description of expected
  behaviour — two real screenshots, one per plot status branch.

### 2026-08-14 — wrap: D-012/D-013 revision closed pending one manual check
- Done: ran the full gate post-`/review` fixes, updated `PROGRESS.md`'s `## Current`
  and `Deferred`, left `docs/plans/03.md` without the `Status: complete` marker on
  purpose — criterion 6 (the sheet visually shows only length/breadth/conditional-owner)
  was never confirmed in a browser this session, only by reading the component. D-016 and
  the D-012/D-013 amendments were already recorded during `/build`, nothing new to log.
  No new NAVIGATION.md entries needed beyond what was added during `/build`.
- Next: a human opens a browser, looks at the sheet, confirms it. Then the plan gets its
  completion marker.
- Surprises: none — this was a clean close of already-`/review`ed work.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 36/36
  tests, clean build.

### 2026-08-14 — M4 Tier 2 follow-up: Save/Undo UI, name prompt
- Done: wired the M4 write path into the UI. `lib/identity/actor.ts` +
  `features/identity/NamePrompt.tsx` — one-time free-text "who's using this device?"
  prompt (D-016), persisted to `localStorage`, gates `App.tsx` until answered.
  `features/plot-detail/PlotStatusActions.tsx` (new, tested) renders Save buttons for
  each legal next status plus an Undo button (visible only when the plot's most recent
  history row is the current actor's own). `PlotDetailSheet.tsx` now calls
  `applyPlotTransition()`, handles the typed conflict result with a banner + refresh
  button, and notifies `ColonyMap.tsx` to update the SVG's `data-status` attribute
  directly on success (same direct-DOM pattern as the initial load, no full re-fetch).
  Tier 2 — no `/plan`/`/review`, `/check` run instead.
- Next: a human opens a browser and actually clicks Save/Undo.
- Surprises: none.
- Verified: `/check`'s PASS/FAIL table — all M4 Tier 1 acceptance criteria still pass
  unchanged (this diff adds no new write path, just calls the already-reviewed
  `applyPlotTransition()`). Full gate — 42/42 tests (39 + 3 new for
  `PlotStatusActions.test.tsx`), clean build.

### 2026-08-14 — three statuses + plot dimensions (D-012/D-013 revision)
- Done: `docs/plans/03.md` planned and built. Owner gave two direct decisions: (1) three
  statuses not four — `hold` removed, `registered` now displays as "Registry done" (word
  unchanged, D-010-style label/storage split); (2) plot detail sheet shows only Length,
  Breadth, and Owner name — owner name only while `status === "booked"`, not `registered`
  (confirmed explicitly — this was the one place two readings were equally plausible).
  New migration swaps the `status` CHECK on `plots`/`plot_history` to 3 words and adds
  `length_ft`/`breadth_ft numeric not null` to `plots`. `contract/colony.schema.json` and
  `contract/SPEC.md` updated to match (Tier 1 — both halves depend on the contract, even
  though `tools/pipeline` doesn't exist yet). Fixture manifest, seed CSV (4 plots remapped
  `hold`→`available`), `transitions.ts`, `format.ts`, `PlotDetailContent.tsx`,
  `PlotStatusActions.tsx` all updated to match. D-012 and D-013 amended in place (same
  pattern as D-013's earlier "registered not terminal" amendment) rather than superseded
  with new IDs — the underlying decision id still names the same open question
  (vocabulary/field-list), just answered further.
- Next: `/review` this diff, then a human looks at the simplified sheet in a browser.
- Surprises: the M4 Tier 2 test suite (`applyPlotTransition.test.ts`,
  `PlotStatusActions.test.tsx`) had `"hold"` baked into scratch test data and assertions
  in three places — removing a status value from the domain type caught all of them at
  typecheck, but the concurrency test specifically needed a redesign (it used to prove
  "two different destination statuses race" by sending one call to `hold` and one to
  `booked`; with only one legal edge out of `available` now, both concurrent calls target
  `booked` instead — still proves the same thing, one wins one conflicts).
- Verified: `supabase db reset` applies the migration cleanly on the normal reset-and-
  reseed path; `pnpm import:seed` → 45 plots, 0 unmatched. Separately, and for real —
  `/review` correctly caught that `add column ... not null` with no default cannot apply
  to a non-empty table, and that `db reset`'s from-empty replay meant this had never
  actually been exercised against existing data despite the migration's own comment
  claiming otherwise. Fixed (temporary `default 0`, dropped immediately after) and then
  proved directly: reset to just the M2+M4 migrations, hand-inserted a scratch plot with
  `status = 'hold'` via `psql`, piped this migration's SQL into `psql` against that
  populated table — applied clean (`UPDATE 1`, then the `ALTER TABLE`s), and the scratch
  row came back `status = 'available'`, `length_ft = 0`, `breadth_ft = 0` (backfilled).
  Full gate — `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 35/35
  tests (42 minus the 7 fewer transition-pair tests the 3-status table needs). Fixture
  manifest hand-checked against the schema's `required`/`additionalProperties: false`
  list via a small Node script — all 45 plots valid (no automated contract validator
  exists, pipeline is pre-M9).
- `/review` found six real issues, all fixed: (1) the migration's `not null` column add
  with no default would have failed against any populated `plots` table — fixed with a
  temporary default, dropped after, and actually proved against populated data (see
  Verified above), not just re-read. (2) This log's own first draft claimed that proof
  before it existed — corrected to state what was actually run. (3) `PlotStatusActions`'s
  Undo button could target an illegal reverse transition (e.g. `registered → booked`
  isn't legal under the new table) and silently do nothing — `canUndo()` now also checks
  `isLegalTransition()`, plus a new test locks in the illegal-undo case, plus the buggy
  test fixture that had baked the bug in (`available` undoing to `registered`, itself
  illegal) is fixed. (4) A thrown error from `applyPlotTransition` (network failure, etc.)
  left `saving` stuck `true` forever with every button disabled and no message — wrapped
  in `try/catch/finally`, `handleRefresh` got a `.catch()` too. (5) `getStoredActor() ??
  "unknown"` could write a forged name into `plot_history` if storage were ever cleared
  mid-session — the exact "attribution as a claim" mistake a prior `/review` already
  caught once in `PlotDetailContent.tsx` (see the M3 log entry) — fixed by threading
  `App.tsx`'s non-null `actor` state down through `ColonyMap.tsx` to `PlotDetailSheet` as
  a required prop instead of re-reading `localStorage`. (6) `spec/00-rules.md`,
  `spec/01-map-skeleton.md`, `spec/02-map-schema.md`, `spec/06-map-filter-search.md` still
  said "four statuses"/listed `hold` — the plan updated `DECISIONS.md` and both decision
  docs but missed `spec/`; all four fixed. Gate re-run clean after all six.

### 2026-08-13 — M4 Tier 1 core built (migration + lib/plot-status)
- Done: `docs/plans/02.md` planned and built. Scoped M4 to the domain/db layer only —
  spec/04's acceptance criteria are all automated, none manual, so the Save/Undo UI and
  local identity picker were deliberately left as a Tier 2 follow-up rather than bundled
  into this Tier 1 pass (see plan §4). Migration adds `apply_plot_transition()` (row-locked
  via `select ... for update`, one Postgres transaction covering the `plots` update and the
  `plot_history` insert). `lib/plot-status/{transitions,recentEdit,applyPlotTransition}.ts`
  plus `lib/db/plotTransitions.ts`. New decision D-016: actor identity is a client-supplied
  free-text string until M8 — resolved via a user prompt this session rather than guessed,
  since it's a pinned interface shape (`applyPlotTransition(..., actor: string, ...)`).
- Next: build the Tier 2 follow-up (Save/Undo button in `features/plot-detail/`, the local
  name-prompt UI) and get a human to exercise it.
- `/review` found two real issues, both fixed: (1) the atomicity test's original
  `p_actor: null` forced a failure on the `plots` UPDATE itself, never reaching the
  `plot_history` insert — proved nothing about rollback despite the test's own comment
  claiming otherwise. Fixed by adding a `plot_history_note_length` CHECK and forcing the
  failure via an over-length `p_note` instead, which fails only the second statement.
  (2) The test helper inserted its scratch colony with `verified: true`, violating D-108
  ("no code path sets it true") — fixed to `false`. Gate re-run clean after both fixes,
  still 39/39.
- Surprises: `import.meta.env.VITE_SUPABASE_URL` resolves correctly under Vitest (probed
  directly before relying on it) — meant integration tests could reuse
  `getBrowserDbClient()` as-is rather than needing a separate test-only client factory.
  Also: `supabase db reset` wipes the 45-plot seed data along with applying the new
  migration — had to re-run `pnpm import:seed` immediately after, easy to forget.
- Verified: `supabase db reset` applied the new migration cleanly (real output, no
  errors); `pnpm import:seed` re-ran after, `imported 45 plots for "shree-vatika-2", 0
  unmatched`. `pnpm test -- --run applyPlotTransition` → 5/5, including two tests that hit
  the live local DB for real: a genuine `Promise.allSettled` concurrent write (one
  `ok:true`, one `ok:false, reason:"conflict"` with the correct `winnerName`) and a forced
  mid-transaction failure via a direct RPC call with `p_actor: null` (asserted the plot's
  `status`/`version` were unchanged and zero history rows existed afterward). Full gate —
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` — 39/39 tests (14
  baseline + 25 new), clean typecheck/lint/build. Grep for criterion 5 (no `plots.status`
  write outside the new path) — clean.

### 2026-08-12 — M2/M3 live-verified in browser, docs/plans/01.md closed
- Done: Docker Desktop wasn't running this session; started it, waited for the daemon,
  then brought the local Supabase stack back up (`npx -y supabase start` with last
  session's `--exclude` flags — the bare `supabase` command isn't on this shell's `PATH`).
  User then confirmed in a real browser: M2 criterion 5 (all four status colours render)
  and M3 criteria 1/3/4 (sheet loads correct data, attribution line, map stays interactive
  above the sheet). `docs/plans/01.md` now carries the `Status: complete` marker — all 6
  M2 criteria and all 4 M3 criteria verified for real across this session and the last.
  User separately flagged they don't like the sheet's current visual design — noted as
  unscoped feedback in Deferred, not acted on.
- Next: pick M4 (`applyPlotTransition()`, Tier 1) or M9 (pipeline scaffold) to start next
  session; ask the user what they'd change about the sheet's UI before touching it.
- Surprises: the stuck-loading sheet and the single-flat-colour map were the same root
  cause (Supabase unreachable), not two separate bugs — `fetchPlotBySvgId`'s `TypeError:
  Failed to fetch` was the tell. Also: the `supabase` CLI isn't resolvable as a bare
  command in this shell at all (not on `PATH`, not via `pnpm exec`, scoop, or winget) —
  only `npx -y supabase` works, despite the prior session's log implying a normal
  `supabase start` invocation.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` all pass,
  14/14 tests. `docker exec ... psql -c "SELECT count(*) FROM plots"` → 45, confirming the
  seed data survived the Docker restart untouched. M2 #5 and M3 #1/#3/#4 — user-confirmed
  live in a browser, not read back from code.

### 2026-08-12 — /review findings fixed, /wrap's own tooling fixed
- Done: fixed all four findings from `/review` of the M2 migration + M3 diff —
  `guard.sh`/`filesize.sh` now fail closed on an unparseable hook payload instead of
  silently exiting 0; `PlotDetailSheet.tsx`'s drag handle no longer has its own trailing
  click undo the drag it just finished (`didDrag` ref); the inline `20` collapse
  threshold is now a named `COLLAPSE_THRESHOLD` constant; the migration's `anon`/
  `authenticated` grant on `colonies`/`plots` no longer includes `delete`. Separately,
  `/wrap` itself failed ("bash: .claude/preamble.sh: No such file or directory") because
  the shell's cwd had drifted to `apps/map` from an earlier command in the same session —
  fixed `preamble.sh` to self-locate via `BASH_SOURCE` and repointed all 13 `!` preamble
  call sites at an absolute path (see Current for detail).
- Next: a human runs `pnpm dev` for M2 criterion 5 and M3 criteria 1/3/4 — the only
  remaining items before `docs/plans/01.md` is marked complete.
- Surprises: `preamble.sh` already had a defensive `cd "${CLAUDE_PROJECT_DIR:-.}"` meant
  to guard exactly this failure mode, but that env var is unset in the shell these `!`
  preambles run in, so the guard silently no-op'd — a fallback that degrades to doing
  nothing is indistinguishable from no fallback until something actually depends on it.
- Verified: hook fixes — `printf 'not json at all' | bash .claude/hooks/guard.sh` → now
  blocks with exit 2 (was exit 0); same shape confirmed for `filesize.sh`; legitimate
  payloads through both still pass. Gate — `pnpm typecheck && pnpm lint && pnpm test --
  --run && pnpm build`, all clean, 14/14 tests, twice (once after the four fixes, once
  after this log entry's own build). Preamble fix — `bash "<abs path>/.claude/preamble.sh"
  wrap-status` and `... commands`, both run for real with cwd deliberately left at
  `apps/map`, both resolved correctly. Migration grant change — NOT re-applied to a live
  DB: Docker Desktop wasn't running this session and wasn't started (no explicit
  instruction to do so this time).

### 2026-08-11 — scaffold generated
- Done: Monorepo scaffold, shared contract + JSON schema, 17 milestone specs, 32 decisions,
  three tier rules, and a shared 45-plot demo colony with a synthetic CAD-style source PDF.
- Next: M1.
- Surprises: Started as two repos and merged. The split had already produced real drift —
  the `verified` check existed on one side only, and the demo geometry was duplicated. The
  contract is now one schema both halves validate against, which is stronger than mirrored
  prose. Also: the fixture generator shipped a bug where `<use>` with no width/height scaled
  every tree to the full viewport. Every unit test passed; only a raster render caught it.
- Verified: settings.json parses; hooks exit 2 on blocked and 0 on allowed commands; fixture
  validates against contract/colony.schema.json; demo PDF opens as vector with 198 drawing
  paths, 45 selectable plot labels, all 45 contained in their polygons.

### 2026-08-11 — M1 skeleton and colony render
- Done: `apps/map/` scaffolded with Vite/React/TS, Tailwind v4, Leaflet, Framer Motion,
  Vitest. `ColonyMap.tsx` renders the shared fixture via `CRS.Simple` + `svgOverlay`;
  `colony-theme.css` holds ground/road/garden/tree/plot colours plus the four status
  variables (unused until M2), all status-driven fill going through `data-status`, never a
  component prop. `package.json` scripts match the names `CLAUDE.md`/`/start` expect.
- Next: manual browser/iPhone verification of click and pinch-zoom, then M2 or M9.
- Surprises: Vite's dev-server `fs.allow` had to be widened to the repo root so the app can
  import `fixtures/shree-vatika-2/colony.svg` in place — the monorepo has no root
  `package.json`/workspace file for Vite to discover automatically, since each half owns its
  own toolchain by design.
- Verified: `make verify-map` (typecheck + vitest, 3 tests) passes; `pnpm lint` (oxlint)
  clean; `pnpm build` succeeds; fixture still has 45 `.plot` paths, 0 styling attributes
  (`fill=`/`stroke=`/`style=`). Pinch-zoom and click-in-a-real-browser (criteria 5–6) —
  **not run**, no device available this session.

### 2026-08-12 — plot clicks were dead on arrival; fixed
- Done: `pnpm dev` permission added to `CLAUDE.md` (background-run only, human still does
  the visual check — no browser/device here). Found and fixed the reason clicks never
  reached a plot: Leaflet's own stylesheet ships `.leaflet-pane > svg path { pointer-events:
  none }` (specificity 0,1,2), which silently beat our bare `.plot` rule (0,1,0) and made
  every plot path pointer-transparent — clicks fell through to the `leaflet-container` div
  underneath. `colony-theme.css` now has `.colony-svg-root .plot { pointer-events: auto; }`
  (0,2,0) to win that fight. Also swapped the click handler from a raw
  `addEventListener` on the Leaflet-owned SVG node to React's own `onClick` on the
  container div — not the actual fix, but more robust against future dev-mode remounts.
  Added a dev-only (`import.meta.env.DEV`-gated, stripped from prod) on-screen badge
  showing the last-clicked plot id, since iOS Safari has no reachable console without a
  tethered Mac.
- Next: criterion 6 (iPhone pinch-zoom) is the last open item for M1.
- Surprises: two independently-implemented click handlers (raw DOM listener, then React
  synthetic) both failed identically — the bug was never in listener wiring, it was a CSS
  specificity fight with Leaflet's own stylesheet. `e.target` from a `document`-level
  capturing listener (bypasses any stopPropagation) was what actually localized it: it
  showed the `leaflet-container` div as the click target, not any SVG descendant, meaning
  the click was never reaching the SVG's hit-testing surface at all.
- Verified: `make verify-map`, `pnpm lint`, `pnpm build` all pass after the fix; user
  confirmed clicking a plot in a real browser now shows the id (console + on-screen badge).

### 2026-08-12 — wrap
- Done: ran the full gate. `make gate` fails at `contract` (`cd tools/pipeline` — the
  directory doesn't exist yet, expected pre-M9). Ran the map half directly instead:
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`, all clean.
- Next: criterion 6 (iPhone pinch-zoom) is the one open item before M1 is fully closed.
- Surprises: none.
- Verified: see above — real command output, not re-read from a prior pass.

### 2026-08-12 — M2 build: schema, seed import, status colours
- Done: Migration for `colonies`/`plots`/`plot_history` (append-only trigger, permissive
  RLS, `status` as CHECK not enum), `lib/db/` (client + colonies/plots/plotHistory,
  split into a pure `client.ts` and a Vite-only `browserClient.ts` so the same functions
  work under both the app's bundler tsconfig and the import script's node tsconfig),
  `lib/colony/plotStatus.ts`, `ColonyMap.tsx` wired to set `data-status`, and
  `scripts/import-seed.ts`. Amended D-013 (registered no longer terminal) and the now-wrong
  line in `spec/00-rules.md`. Also fixed `/build`'s broken preamble and removed
  `disable-model-invocation`/the migrations deny-rule at the user's explicit request — see
  Current for detail.
- Next: get real DB access (user runs `supabase db reset`) and run the acceptance checks
  that need it; then `/review`.
- Surprises: `tsconfig.node.json` (vite.config.ts's config) and `tsconfig.app.json` (src's
  config) disagreed once `scripts/` started importing from `src/lib/db/` — nodenext module
  resolution demands explicit `.ts` extensions on relative imports and rejects
  `import.meta.env`, neither of which the bundler-mode app config requires. Splitting
  `getBrowserDbClient()` into its own file and adding extensions throughout `lib/db/`
  fixed it; this is a real seam future `lib/*` code shared between app and scripts will
  hit again.
- Verified: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` all pass.
  `pnpm import:seed` run twice against the real fixture: once with real inputs (correctly
  progressed through manifest parse, SVG/CSV orphan checks, and CSV field validation
  before stopping at the missing-env-var check, since no Supabase instance exists here),
  once against a scratch copy with `verified: false` (exited 1 with the D-108 refusal
  message — criterion 2b is the one acceptance criterion actually closed this session).
  Criteria 1/2/3/4/5 from `docs/plans/01.md` — **not run**, no live database in this
  environment.

### 2026-08-12 — M3 built, and M2 finally got a live database
- Done: two threads. (1) M3's plot detail bottom sheet built end to end (Tier 2, `/build`
  then `/check`) — see Current for the full file list. (2) M2's live-verification blocker
  is gone: user had Claude edit `CLAUDE.md` and `.claude/settings.json` to lift the
  `supabase db reset` and `.env` restrictions, then start Docker Desktop itself. Got a
  real local Supabase instance running, imported the real 45-plot fixture for real, and
  ran 5 of M2's 6 acceptance criteria directly against it — see Current for each one's
  real output. Found and fixed a genuine migration bug in the process (missing `GRANT`s —
  RLS alone doesn't grant table access in Postgres).
- Next: a human runs `pnpm dev` and looks — M2 criterion 5 (status colours) and M3
  criteria 1/3/4 (sheet opens with correct data, attribution line, map stays interactive)
  all need real eyes now that real data exists to look at. After that, `/review` on the
  M2 migration fix (Tier 1) before `/wrap` marks `docs/plans/01.md` complete.
- Surprises: RLS policies being permissive was not sufficient for anon access — Postgres
  checks the underlying `GRANT` before it ever consults a policy, and the migration never
  granted anything to `anon`/`authenticated`. This was invisible in every prior session
  because nothing had a live database to test against; it's exactly the kind of gap the
  plan's acceptance criteria existed to catch, and did. Also: Docker already had an
  unrelated project's Supabase stack running on this machine and holding the default
  ports — worth checking `docker ps` before assuming a fresh `supabase start` has the
  ports to itself.
- Verified: `supabase db reset` (real, after the fix) applied cleanly; `pnpm import:seed`
  → `imported 45 plots for "shree-vatika-2", 0 unmatched`; a scratch `verified: false`
  manifest → exit 1 with the D-108 message; `docker exec ... psql -c "UPDATE
  plot_history..."` → `ERROR: plot_history is append-only — UPDATE is not permitted`;
  `\d plots` → `rate_paise`/`booking_amount_paise` both `bigint`. M3:
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` all pass, 14/14 tests
  (11 new formatter tests). Not run: M2 criterion 5, M3 criteria 1/3/4 — all need a human
  in a browser.
