# Progress

## Current

- **Task:** M2 — Schema, seed import, status colours
- **Tier:** 1 (migrations, RLS, `lib/db`). `/plan` written and built against.
- **Plan:** `docs/plans/01.md`.
- **State:** `apps/map/supabase/migrations/20260812120000_m2_schema.sql` creates
  `colonies`, `plots`, `plot_history` — money as `bigint _paise`, `status` a `text` `CHECK`
  (not a Postgres enum, since D-013's words are still unconfirmed), append-only
  `plot_history` enforced by a trigger, RLS permissive per D-011 with M8-tightening
  comments. `apps/map/supabase/config.toml` is hand-written (no Supabase CLI in this
  environment — verify against your own CLI before trusting it). `lib/db/` (client,
  colonies, plots, plotHistory) is the only place `supabase.from()` appears. `lib/colony/`
  fetches plot status and stays DOM-free; `ColonyMap.tsx` applies it as `data-status`,
  which `colony-theme.css`'s selectors from M1 already render. `scripts/import-seed.ts`
  loads the fixture + `seed/plot-status-seed.csv`, refuses an unverified manifest,
  validates `svg_id` orphans in both directions against the SVG and the CSV, and writes
  one `plot_history` row per plot on import.
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` all pass. The import
  script was dry-run against the real fixture (parses, cross-validates, and correctly
  stops at the missing-env-var check) and against a scratch manifest with
  `verified: false` (exits 1 with the right message) — both real runs, not read back.
  **Not verified:** criteria 1/2/3/4/5 from the plan, all of which need a live Supabase —
  none is available in this environment. `pnpm import:seed` has never actually inserted a
  row.
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
- **Next action:** Run `supabase db reset` locally (or otherwise provide DB access), set
  `apps/map/.env` from `.env.example`, then run `pnpm import:seed` and the remaining
  acceptance checks (§5 of `docs/plans/01.md`) for real. Then `/review` before `/wrap`.

## Deferred

- D-012's exact field list and D-013's four status *words* are still unconfirmed against
  the family's real WhatsApp PDF (the `registered`-terminal sub-question is now settled,
  see Current). Adding a column later is cheap; renaming one after live data exists is
  not — confirm before M4 starts writing real transitions against these words.
- `apps/map/supabase/config.toml` was hand-written without the Supabase CLI available in
  this environment. Verify it against `supabase init`'s actual output on a machine that
  has the CLI before relying on it for local dev.
- `pnpm`/`wrangler` (D-014), Python toolchain (D-117), read-only offline (D-008), and
  no-photos-in-v1 (D-015) were proposed and not explicitly confirmed. All reversible.
- Whether their real PDFs are vector or raster is unknown. If raster, M17's fallback stops
  being last and becomes urgent. `make inspect` on one real file settles it.
- How a new colony reaches production once exported is undecided. M6 imports by script.

## Log

<!-- Append-only. Four lines per entry: Done / Next / Surprises / Verified. -->

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
