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
| `.claude/preamble.sh` | Read-only helper the skills call to inline state into their `!` blocks. Claude Code's permission checker rejects any shell expansion (`\|\|`, pipes, `;`, `$(...)`, bare `$VAR`) inside those blocks, so all of it lives here behind one allow-list entry, invoked with a literal, hardcoded absolute path (`C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh`) — a relative path breaks the moment the shell's cwd drifts from repo root, which happened and broke `/wrap` on 2026-08-12. The script self-locates via `BASH_SOURCE` once running; do not reintroduce a `$CLAUDE_PROJECT_DIR` dependency, it is unset in this shell. Add a subcommand rather than putting shell back in a skill. |

## Feature index

| Feature | Domain logic | Data access | UI | Tables |
|---|---|---|---|---|
| Colony render, pan/zoom (M1) | none yet | none yet — fixture read directly | `apps/map/src/components/ColonyMap.tsx` | none yet |
| Status colours (M2) | `apps/map/src/lib/colony/plotStatus.ts` | `apps/map/src/lib/db/` | `apps/map/src/components/ColonyMap.tsx` sets `data-status` | `colonies`, `plots`, `plot_history` |
| Plot detail sheet (M3) | `apps/map/src/lib/colony/plotDetail.ts` | `apps/map/src/lib/db/` | `apps/map/src/features/plot-detail/{PlotDetailSheet,PlotDetailContent}.tsx`, opened from `ColonyMap.tsx`'s `selectedId` | `plots`, `plot_history` (read-only) |
| Status writes/transitions (M4, domain core only — no UI yet) | `apps/map/src/lib/plot-status/{transitions,recentEdit,applyPlotTransition}.ts` | `apps/map/src/lib/db/plotTransitions.ts` → `apply_plot_transition()` (Postgres function, one transaction, row-locked) | none yet — Save/Undo button and the local identity picker are the Tier 2 follow-up | `plots`, `plot_history` (write) |

## Reusable functions

| Function | Path | What it does |
|---|---|---|
| `createDbClient(url, anonKey)` | `apps/map/src/lib/db/client.ts` | Pure Supabase client factory — no `import.meta`/`process.env` reads. Safe from both Vite and tsx contexts. |
| `getBrowserDbClient()` | `apps/map/src/lib/db/browserClient.ts` | Reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and calls `createDbClient`. Vite-only — never import this from `scripts/`. |
| `insertColony`, `insertPlots`, `fetchPlotStatuses`, `fetchPlotBySvgId` | `apps/map/src/lib/db/{colonies,plots}.ts` | The only place `supabase.from()` appears. |
| `insertPlotHistory`, `fetchPlotHistory` | `apps/map/src/lib/db/plotHistory.ts` | Appends/reads history rows; the table itself rejects UPDATE/DELETE via a DB trigger, and the migration grants it no update/delete privilege either. |
| `loadPlotStatuses(client, colonyId)` | `apps/map/src/lib/colony/plotStatus.ts` | Domain-shaped `{ svg_id: status }`. DOM-free by design — callers apply `data-status` themselves. |
| `loadPlotDetail(client, colonyId, svgId)` | `apps/map/src/lib/colony/plotDetail.ts` | Full plot row + its history, DOM-free — `PlotDetailSheet.tsx` owns rendering. |
| `formatRupees`, `formatDate`, `formatRelativeTime`, `formatStatusLabel` | `apps/map/src/shared/format.ts` | The "Pure" layer (imports nothing). Rupees exist only here (D-010); `formatRelativeTime` is pinned to `Asia/Kolkata` regardless of viewer's device timezone. Unit-tested in `format.test.ts`. |
| `applyPlotTransition(client, input)` | `apps/map/src/lib/plot-status/applyPlotTransition.ts` | The **only** path that writes `plots.status` (D-006, D-013). Returns a typed `PlotTransitionResult` — `illegal_transition`/`conflict` are return values, never thrown. Nothing else may call `callApplyPlotTransition` or the `apply_plot_transition` RPC directly. |
| `isLegalTransition(from, to)` | `apps/map/src/lib/plot-status/transitions.ts` | The amended D-013 table. No self-transitions. |
| `isRecentlyEdited(updatedAt, now)`, `RECENT_EDIT_WARNING_MINUTES` | `apps/map/src/lib/plot-status/recentEdit.ts` | Pinned at 5 minutes (spec/04) — not yet wired into any UI warning banner. |
| `callApplyPlotTransition(client, args)` | `apps/map/src/lib/db/plotTransitions.ts` | The only place `apply_plot_transition` is called via `.rpc()`. |

## Scripts

| Script | Path | What it does |
|---|---|---|
| `pnpm import:seed` | `apps/map/scripts/import-seed.ts` | One-off initial load: manifest + `seed/plot-status-seed.csv` → `colonies`/`plots`/`plot_history`. Refuses `verified: false`; validates `svg_id` orphans both ways against `colony.svg` and the CSV. Not the app's write path — that's M4. |

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
