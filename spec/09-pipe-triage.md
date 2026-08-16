# M9 — Triage and ingest

**Tier 2** (`tools/pipeline/pipeline/io/`). Plus Tier 3 project setup.

## Goal

Point the tool at any PDF and get a report telling you which path it will take and what it
found. Ten seconds, no guessing.

## Build

- `tools/pipeline/pyproject.toml`, `Makefile` with the targets named in `CLAUDE.md` (`verify`, `gate`,
  `serve`, `ingest`, `export`), and the package layout from `NAVIGATION.md`.
- Dependencies: `pymupdf`, `shapely`, `numpy`. `ezdxf` arrives with M10.
- `tools/pipeline/pipeline/io/pdf.py` — open a PDF, report per page: vector or raster, drawing-path
  count, text-span count, page bounding box, and rotation.
- `tools/pipeline/pipeline/cli/inspect.py` — `make inspect PDF=...` prints the triage report and names
  the tier: vector, raster, or mixed.

The vector/raster test that matters: a PDF exported by `DWG To PDF.pc3` yields hundreds of
drawing paths and real text spans. One exported by "Microsoft Print to PDF" yields a single
full-page image and zero text. The report must make that difference obvious at a glance,
because the fix is re-exporting, not writing code.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Lint, types, and tests pass | `make verify` |
| 2 | Demo fixture reports as vector with >100 paths and >40 text spans | `make inspect PDF=fixtures/demo-plan.pdf` |
| 3 | The rasterised fixture reports as raster with 0 text spans | `make inspect PDF=fixtures/demo-plan-scan.jpg` |
| 4 | A rotated or landscape page reports correct dimensions | Unit test with a synthetic page |
| 5 | An unreadable file fails with a clear message, not a traceback | Feed it this spec file |

## Non-goals

Extracting polygons, matching labels, export. This milestone only tells you what you have.

## Its role since D-118

The pipeline ingests DXF only, so triage is no longer the fork between two automatic paths —
both are cut. It answers a narrower question that still matters: someone handed me a file,
is it a real drawing worth chasing the DWG for, or a picture to trace over in AutoCAD?
