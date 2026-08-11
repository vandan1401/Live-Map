# Navigation

Look here before exploring. An un-indexed function gets re-implemented by the next session.

## Repo shape

```
contract/           SPEC.md + colony.schema.json — the interface. Tier 1.
fixtures/           one shared demo colony + a synthetic CAD-style source PDF
seed/               demo statuses, owners, brokers — imported in M2
apps/map/           the PWA          (TypeScript, pnpm, Vite, Supabase)
tools/pipeline/     the local tool   (Python, Make, pytest)
spec/               01-08 the app · 09-17 the pipeline
```

Both halves read `contract/` and `fixtures/`. Neither imports from the other — the SVG and
manifest are the only things that cross.

## apps/map — layer boundaries

| Layer | Path | May import | May NOT |
|---|---|---|---|
| Data access | `apps/map/src/lib/db/` | supabase-js | React |
| Domain | `apps/map/src/lib/{plot-status,colony}/` | `lib/db`, `src/shared` | React, DOM |
| Sync | `apps/map/src/lib/sync/` | `lib/db` | components |
| Features | `apps/map/src/features/` | all `src/lib/*` | other features |
| Components | `apps/map/src/components/` | `src/shared` | `lib/db` |
| Pure | `apps/map/src/shared/` | nothing | everything |

`supabase.from(...)` appears only in `lib/db/`. Anywhere else is a review finding.

## tools/pipeline — the run, end to end

```
PDF/image ─► io ─► extract ─► geom ─► matching ─► derive ─► overrides ─► export
                                                                            │
                                                       out/<colony>/ ───────┤
                                                         colony.svg         │
                                                         colony.json ───────┘
                                                                            │
                                         verify/index.html reads out/ ──────┘
                                         corrections write overrides/<colony>.json
```

`pipeline/geom/` imports no file-format library — no fitz, no cv2, no PIL. That purity is
what makes it cheap to test, and every other module depends on it.

## Where do I change X?

| I want to change… | Go to | Tier |
|---|---|---|
| The SVG classes, id format, or manifest schema | `contract/` | 1 |
| Which transitions are legal | `apps/map/src/lib/plot-status/transitions.ts` | 1 |
| Conflict detection on a stale write | `apps/map/src/lib/plot-status/` | 1 |
| Cache expiry, the freshness indicator | `apps/map/src/lib/sync/` | 1 |
| Database schema, RLS policies | `apps/map/supabase/migrations/` | 1 |
| Status colours, map theme | `apps/map/src/styles/colony-theme.css` | 3 |
| Plot detail sheet fields | `apps/map/src/features/plot-detail/` | 2 |
| How a plot number is matched to a polygon | `tools/pipeline/pipeline/matching/assign.py` | 1 |
| Plot vs garden vs amenity classification | `tools/pipeline/pipeline/matching/classify.py` | 1 |
| Y-flip and viewBox normalisation | `tools/pipeline/pipeline/export/normalise.py` | 1 |
| How overrides are keyed and reapplied | `tools/pipeline/pipeline/overrides/store.py` | 1 |
| The QA checks that block an export | `tools/pipeline/pipeline/export/qa.py` | 1 |
| Snapping, polygonize, simplification | `tools/pipeline/pipeline/geom/` | 1 |
| Reading paths and text from a vector PDF | `tools/pipeline/pipeline/extract/vector.py` | 2 |
| OpenCV contours and OCR | `tools/pipeline/pipeline/extract/raster.py` | 2 |
| Roads, trees, facing, corner | `tools/pipeline/pipeline/derive/` | 2 |
| The tracing tools | `tools/pipeline/verify/tracer.js` | 1 |

## Session tooling

| File | What it does |
|---|---|
| `.claude/preamble.sh` | Read-only helper the skills call to inline state into their `!` blocks. Claude Code's permission checker rejects compound shell (`\|\|`, pipes, `;`) inside those blocks, so all of it lives here behind one allow-list entry. Add a subcommand rather than putting shell back in a skill. |

## Feature index

| Feature | Domain logic | Data access | UI | Tables |
|---|---|---|---|---|
| _(filled in as milestones land)_ | | | | |

## Reusable functions

| Function | Path | What it does |
|---|---|---|
| _(filled in as milestones land)_ | | |

## Shared fixtures

| File | What it is |
|---|---|
| `fixtures/shree-vatika-2/colony.svg` | 45-plot demo colony. Geometry only, no styling. |
| `fixtures/shree-vatika-2/colony.json` | Manifest. Validates against the schema. |
| `fixtures/demo-plan.pdf` | Synthetic CAD-style vector plan — the pipeline's input. |
| `fixtures/demo-plan-scan.jpg` | The same plan degraded, for the M17 raster fallback. |
| `seed/plot-status-seed.csv` | Demo statuses, owners, brokers. |

One copy of each, used by both halves. The pipeline's golden test asserts it reproduces the
same 45 plot ids and centroids the app renders. Two copies would drift; this is the failure
that motivated merging the two original repos.
