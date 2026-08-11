# Progress

## Current

- **Task:** M1 — repo skeleton and colony render
- **Tier:** 3 (scaffolding, config, static render). No state writes.
- **Plan:** none on disk. Tier 3 needs no `/plan` — built straight from
  `spec/01-map-skeleton.md`.
- **State:** `apps/map/` scaffolded (Vite + React 19 + TS + Tailwind v4). Renders
  `fixtures/shree-vatika-2/colony.svg` full-bleed via Leaflet `CRS.Simple` +
  `L.svgOverlay` (D-009) — the SVG is read in place from the shared fixture, not copied.
  `tools/pipeline/` still untouched.
  `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build` (the map half of
  `make gate`) passes clean. `make gate` itself still fails at the `contract` prerequisite
  — `tools/pipeline/` doesn't exist yet, which is expected before M9, not a regression.
  Criterion 5 (click → id) confirmed manually in a real desktop browser. **Still not
  verified:** criterion 6, pinch-zoom smoothness on an actual iPhone.
- **Next action:** Verify criterion 6 on an iPhone to fully close M1, then move to
  scaffolding `tools/pipeline/` per `spec/09-pipe-triage.md`, or continue the app per
  `spec/02-map-schema.md` (Supabase schema, M2) — family confirmation of D-012/D-013 is a
  prerequisite for M2 either way.

## Deferred

- Plot fields (D-012) and status words (D-013) are provisional. Confirm against the
  family's WhatsApp status PDF **before** M2 writes the migration. Adding a column later is
  cheap; renaming one after live data exists is not.
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
