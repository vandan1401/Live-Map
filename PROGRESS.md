# Progress

## Current

- **Task:** M2 and M3 are both closed. `docs/plans/01.md` carries the `Status: complete`
  marker. Next up is M4 (`applyPlotTransition()`) or M9 (pipeline), plus the UI-taste pass
  noted below — pick one to start next session.
- **Tier:** M2 was Tier 1 (migrations, RLS, `lib/db`) — `/plan` at `docs/plans/01.md`, built
  and now live-verified, plan closed. M3 was Tier 2 (`features/plot-detail`, `lib/colony`,
  `lib/db`) — no `/plan` required, built, `/check`ed, and now live-verified.
- **M2 state:** a live local Supabase instance now exists (Docker + `supabase start`,
  see below) and 5 of 6 plan criteria are verified for real, not read back:
  - #1 migration applies to a clean DB — `supabase db reset` succeeded.
  - #2 45 plots imported, 0 unmatched — `pnpm import:seed` real output:
    `imported 45 plots for "shree-vatika-2", 0 unmatched`.
  - #2b `verified: false` refused — scratch manifest, real run, exit 1 with the D-108
    message, scratch files deleted after.
  - #3 `UPDATE` on `plot_history` rejected — real SQL via `docker exec ... psql`, got
    `ERROR: plot_history is append-only — UPDATE is not permitted`.
  - #4 no float money column — real `\d plots`: `rate_paise`/`booking_amount_paise` are
    `bigint`.
  - #5 all four status colours render — **verified live**, user confirmed in a real
    browser after the Docker/Supabase restart below.
  - #6 full gate — passes (see Verified below).
  - **Bug found and fixed live:** the M2 migration created RLS policies but never
    `GRANT`ed table privileges to `anon`/`authenticated` — Postgres RLS only restricts
    access a role already has; without the grant, PostgREST's anon connection got
    `permission denied for table colonies`. Fixed in the same migration file (added
    `grant select/insert/update` on `colonies`/`plots`, `grant select/insert` only
    on `plot_history` — no update/delete grant, so append-only holds at the privilege
    layer too, not just the trigger). This was the migration's first ever live
    application, so it was amended in place rather than as a new migration. `delete` was
    originally granted too but dropped in a later `/review` pass this session — no code
    path deletes a colony or a plot, so it was wider than any stated requirement.
  - **Second bug found in `/review` of the M3 diff, same migration:** `plots.updated_by`
    was nullable in the DB but non-nullable (`string`, not `string | null`) in
    `PlotInsert`/`PlotRow` — and `PlotDetailContent.tsx` had a `?? "import"` fallback
    papering over the mismatch, which is exactly the "attribution as a claim" tier-1.md
    warns against. Fixed by making the column `not null` in the same in-place amendment
    (every writer already sets it) and deleting the fallback. `supabase db reset` +
    `pnpm import:seed` re-run after this fix too — both real, both passed.
  - `docs/plans/01.md` now has the `Status: complete` marker — all 6 criteria verified.
- **M2 environment setup this session (previously blocked, see prior log entries):**
  Docker Desktop was installed but not running; started it. Docker already had another,
  unrelated local project's Supabase stack running (`..._Turf_booking`, holding the
  default ports 54321-54324) — user chose to bump colony-map's local ports instead of
  touching the other project; `apps/map/supabase/config.toml` now uses 55321-55324.
  `supabase start` failed twice on unrelated service health-check timeouts (storage,
  realtime, analytics, studio — likely resource contention running two stacks); fixed by
  `supabase start --exclude realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,
  edge-runtime,logflare,vector,supavisor` — M2/M3 only need Postgres + PostgREST + auth +
  kong. `CLAUDE.md`'s "Never run `supabase db reset`" line was removed at the user's
  explicit request (confirmed no remote Supabase project is linked first — see the
  Commands section for the exact reasoning). `.claude/settings.json`'s `.env` deny rules
  (`Read(.env)`, `Read(.env.*)`, `Edit(.env)`) were also removed at the user's explicit
  request; `apps/map/.env` now holds the local instance's URL/anon key.
- **M3 state:** `lib/db/plots.ts` gained `fetchPlotBySvgId`, `lib/db/plotHistory.ts`
  gained `fetchPlotHistory` (+ `PlotHistoryRow` type), `lib/colony/plotDetail.ts` is the
  new DOM-free `loadPlotDetail()`. `shared/format.ts` (new — the "Pure" NAVIGATION.md
  layer, imports nothing) holds `formatRupees`/`formatDate`/`formatRelativeTime`
  (IST-pinned, `Asia/Kolkata`, so the display never depends on the viewing device's own
  timezone)/`formatStatusLabel`, all unit-tested first per `/build`'s TDD rule for pure
  layers. `features/plot-detail/{PlotDetailSheet,PlotDetailContent}.tsx` render the sheet
  (Framer Motion drag-to-dismiss/expand via the `dragConstraints={top:0,bottom:0}` +
  `dragElastic` rubber-band trick) and every D-012 field read-only. `ColonyMap.tsx` now
  tracks `selectedId` (renamed from the old dev-only `lastClickedId`), applies
  `.is-selected` via direct DOM manipulation (same pattern as `data-status`, since the SVG
  is raw parsed markup, not a React tree), and opens/dismisses the sheet on
  plot-click/map-click. New CSS lives in `styles/plot-detail-sheet.css`, split out of
  `colony-theme.css` to keep that file under the 250-line cap (invariant 7) — it was
  about to cross 250 with the sheet rules inlined.
  **Verified live:** M3 criteria 1/3/4 (sheet opens with correct data, attribution line,
  map stays interactive above the sheet) all confirmed by the user in a real browser.
  Criterion 2 (money formatting) is unit-tested and passing. User's one note: does not
  like the sheet's current UI/visual design — functionally correct, revisit look-and-feel
  later (not blocking, no specifics given yet).
- **Decided this session:** `registered` is not terminal (D-013 amended — a
  `registered → available` reversal exists, symmetric with `booked → available`); D-012
  field list and D-013 vocabulary words themselves remain unconfirmed against the family's
  real PDF, proceeding on the words/fields already in the spec.
- **Tooling fixed this session:** `/build`'s preamble had `$0` inside a `!` shell block,
  which Claude Code's permission checker rejects outright whenever no argument is passed
  (a hard shell-expansion guard, not a settings.json permission) — swapped to the
  existing no-arg `plan-latest` subcommand. `disable-model-invocation: true` removed from
  `plan`, `review`, `build`, `wrap`, `check`, `start` (user's explicit request, to let
  Claude drive the full session loop without retyping each command). The
  `Edit(migrations/**)` deny rule in `.claude/settings.json` was also removed (user's
  explicit request) — migration files can now be edited/written directly.
- **`/review` run and its findings fixed this session** (see log entry below for detail):
  a fail-open gap in `guard.sh`/`filesize.sh`, a drag/click bug in `PlotDetailSheet.tsx`,
  an inline magic number, and the over-wide `delete` grant noted above. Gate re-run clean
  after all four.
- **Session tooling fixed this session:** every skill's `!` preamble (`bash
  .claude/preamble.sh <sub>`) broke when the shell's cwd drifted away from the repo root
  (e.g. after a `cd apps/map && ...` tool call) — `/wrap` failed outright with "No such
  file or directory". Fixed two layers: `preamble.sh` now self-locates via `BASH_SOURCE`
  instead of the (empirically unset) `$CLAUDE_PROJECT_DIR`, and all 13 `!` call sites
  across the six `SKILL.md` files now invoke it by absolute path. `.claude/settings.json`
  gained a matching absolute-path allow entry alongside the old relative one. Tradeoff:
  the absolute path is specific to this machine/clone; moving the repo means updating all
  13 call sites plus the settings.json entry.
- **This session's Docker/Supabase restart:** Docker Desktop was not running at session
  start (it does not auto-start on login on this machine), so every Supabase call in the
  browser failed with `TypeError: Failed to fetch` — surfaced as a stuck-loading plot
  detail sheet and plots falling back to their unstyled colour (all 45 showing one flat
  shade, not "only some colours missing"). Fixed by starting Docker Desktop, waiting for
  the daemon, then `supabase start` with the same `--exclude` flags as the prior session.
  The `supabase` CLI is not on this shell's `PATH` at all (`where.exe supabase`, `pnpm
  exec supabase`, scoop, and winget all came up empty) — `npx -y supabase <cmd>` is what
  actually works here and is what resolved the CLI to 2.113.0, matching the prior
  session's version. Seed data survived the restart untouched (`SELECT count(*) FROM
  plots` → 45) — stopping the stack does not drop the Docker volume.
- **Next action:** pick M4 (`applyPlotTransition()`, Tier 1) or M9 (pipeline scaffold) to
  start next session. The UI-taste feedback on the plot detail sheet is unscoped — ask the
  user what specifically they'd change before touching `styles/plot-detail-sheet.css`.

## Deferred

- The `supabase` CLI must be invoked as `npx -y supabase <cmd>` in this shell — it is not
  on `PATH` as a bare `supabase` command (checked `where.exe`, `pnpm exec`, scoop, winget;
  none found it, but `npx -y supabase --version` resolves and runs fine). Any future
  session or skill preamble that shells out to `supabase` directly will fail the same way
  `/wrap`'s `preamble.sh` broke on a relative path — prefer `npx -y supabase` or document
  wherever the real binary lives if the user installs it more permanently.
- Docker Desktop does not auto-start on login on this machine — any session that needs the
  local Supabase stack should check `docker info` first rather than assuming it's up from
  a prior session.
- User does not like the current visual design of the plot detail sheet (M3). No specifics
  given yet — surface this before any further UI polish work, and ask what they'd change
  rather than guessing.

- D-012's exact field list and D-013's four status *words* are still unconfirmed against
  the family's real WhatsApp PDF (the `registered`-terminal sub-question is now settled,
  see Current). Adding a column later is cheap; renaming one after live data exists is
  not — confirm before M4 starts writing real transitions against these words.
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
