# Progress

## Current

- **Task:** M1 — repo skeleton and colony render
- **Tier:** 3 (scaffolding, config, static render). No state writes.
- **Plan:** none on disk. Tier 3 needs no `/plan` — build from `spec/01-map-skeleton.md`.
- **State:** Scaffold only. No `package.json`, no `pyproject.toml`, no `apps/` or `tools/`
  source. The shared fixture and contract exist and are validated.
- **Next action:** Root `Makefile` with the targets named in `CLAUDE.md`, then scaffold
  `apps/map/` (Vite + React + TS + Tailwind) and render
  `fixtures/shree-vatika-2/colony.svg` with working pan/zoom.

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
