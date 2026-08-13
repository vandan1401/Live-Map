# Progress

## Current

- **Task:** M2, M3, and M4's Tier 1 core are all closed (`docs/plans/01.md`,
  `docs/plans/02.md` carry `Status: complete`). M4's Tier 2 UI follow-up (Save/Undo
  button, name prompt) is built and gate-clean. On top of that, this session the owner
  gave two direct product decisions that revise D-012/D-013 — `docs/plans/03.md` (Tier 1:
  contract + migration + `lib/plot-status/`) implements them, `/review`ed (6 findings,
  all fixed and re-verified), gate-clean, and now `docs/plans/03.md` carries the
  `Status: complete` marker — criterion 6 (sheet shows only length/breadth + owner iff
  `booked`) was confirmed live in a browser this session (2026-08-13, see below), the
  last open item.
- **D-013 revision (this session):** three statuses, not four — `available`, `booked`,
  `registered` (displayed as **"Registry done"**, stored word unchanged). `hold` is
  removed entirely; the 4 demo plots that were on hold are remapped to `available` in
  `seed/plot-status-seed.csv`. New transition table: `available→booked`,
  `booked→registered`, `booked→available`, `registered→available`. Migration
  `20260814000000_status_vocabulary_and_dimensions.sql` swaps the CHECK constraints on
  `plots`/`plot_history` and is written to be safe even against a non-reset DB with
  existing `hold` rows (defensive `UPDATE` on `plots` before the constraint swap;
  `plot_history`'s historical `hold` rows are append-only and deliberately untouched).
- **D-012 revision (this session):** the plot detail sheet now shows only Length,
  Breadth (new `length_ft`/`breadth_ft numeric not null` columns, added by hand to the
  fixture manifest — `tools/pipeline/` doesn't exist yet), and Owner name **only when
  `status === "booked"`** (confirmed explicitly, not `registered`). Attribution line and
  history stay. All other DB columns (`owner_phone`, `broker_name`, `rate_paise`,
  `booking_amount_paise`, dates, `notes`) are untouched in the schema — display-only
  trim, nothing dropped.
- **Verified for real this session:** `supabase db reset` applied the new migration
  cleanly on top of live `hold` data from the prior session; `pnpm import:seed` re-ran
  (45 plots, 0 unmatched). Full gate — `pnpm typecheck && pnpm lint && pnpm test -- --run
  && pnpm build` — 35/35 tests (down from 42; the 3-status `transitions.test.ts` has 7
  fewer pairs than the 4-status version, as expected). Fixture manifest hand-checked
  against the schema's new `required`/`additionalProperties: false` list — all 45 plots
  valid (no automated validator exists pre-M9).
- **Next action:** the Save/Undo buttons themselves (working, confirmed built in the
  2026-08-14 Tier 2 log entry below) still haven't been clicked live by a human in a
  browser — worth a real click-through, though nothing about it is currently blocked.
  Otherwise pick the next milestone (M6 colony #2, or the D-107/verified-flag gap noted
  in Deferred).
- **2026-08-13 attempt blocked, then unblocked same day:** first attempt started
  `pnpm dev` (http://localhost:5173/) but Docker Desktop / the local Supabase stack
  wasn't running, so no plot data loaded at all. Fixed via new `make db-up` +
  `.claude/skills/db-up/` (see Deferred) — booted Docker, ran `db-start`, then `pnpm dev`
  (came up on :5174, :5173 was in use) and drove a real browser against it: the map
  renders live status colours (green/gold/grey across all 45 plots, not the flat single
  colour the down-DB state produces), clicking `A-03` (`available`) shows Length 35ft /
  Breadth 35ft and **no** Owner field, clicking `A-01` (`booked`) shows the same plus
  **Owner: Deepak Chouhan**. Criterion 6 confirmed both ways in one session — `docs/plans/
  03.md` now carries `Status: complete`.

## Deferred

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
- Invariant 2 ("no colony is a deliverable until a human verified it... the app refuses
  `false`") is enforced only in `scripts/import-seed.ts`. Neither `lib/colony/plotStatus.ts`
  nor the new `lib/colony/plotDetail.ts` (M3) ever check `colonies.verified` before
  reading — found during `/review` of the M3 diff. Low risk today (only one colony, and
  it's verified), but a second colony added un-verified would render/display silently.
  Close this before M6 (colony #2) if not sooner.
- `pnpm`/`wrangler` (D-014), Python toolchain (D-117), read-only offline (D-008), and
  no-photos-in-v1 (D-015) were proposed and not explicitly confirmed. All reversible.
- Whether their real PDFs are vector or raster is unknown. If raster, M17's fallback stops
  being last and becomes urgent. `make inspect` on one real file settles it.
- How a new colony reaches production once exported is undecided. M6 imports by script.

## Log

<!-- Append-only. Four lines per entry: Done / Next / Surprises / Verified. -->

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
