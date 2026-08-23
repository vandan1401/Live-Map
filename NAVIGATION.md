# Navigation

Look here before exploring. An un-indexed function gets re-implemented by the next session.

## Repo shape

```
contract/           SPEC.md + colony.schema.json — the interface. Tier 1.
fixtures/           one shared colony (svg + manifest + dxf) + a synthetic source PDF
seed/               demo statuses, owners, brokers — imported in M2
apps/map/           the PWA          (TypeScript, pnpm, Vite, Supabase)
tools/pipeline/     the local tool   (Python, Make, pytest)
tools/cad-lisp/     AutoCAD toolkit  (AutoLISP, standalone — see below)
spec/               01-08 + 15 the app · 09-14 the pipeline
```

Both halves read `contract/` and `fixtures/`. Neither imports from the other — the SVG and
manifest are the only things that cross.

## tools/cad-lisp — pre-normalisation AutoCAD toolkit

Standalone tooling (AutoLISP + Python) that speeds up the manual procedure in
`docs/cad-layer-standard.md`, run *before* a DXF ever reaches `make ingest`. No
dependency on `contract/`, `apps/map`, or `tools/pipeline`; writes only to scratch
layers (`CV-MERGED`, `CV-PLOT-DRAFT`, `CV-FLAGS`, `CV-SITE-DRAFT`,
`CV-FEATURE-LABELS-DRAFT`), never to `COL-*` directly — D-118's line between mechanical
cleanup and human judgement holds. No CLAUDE.md risk tier applies here (no `/plan`/
`/review` gate) — the only verification available without a real DXF/AutoCAD session is
byte-compiling and `--help`-smoke-testing the Python scripts. Setup/usage in
`tools/cad-lisp/README.md`.

`cv-tools.lsp` commands (in-AutoCAD, run in this order):

| Command | Does |
|---|---|
| `CV-LAYERS` | creates the 8 `COL-*` layers + 3 `CV-*` scratch layers |
| `CV-MERGE` | moves a selection onto `CV-MERGED`, dedupes via AutoCAD's `OVERKILL` |
| `CV-HIDETEXT` / `CV-SHOWTEXT` | toggles all TEXT/MTEXT visibility, reversible |
| `CV-CLOSE` | **retired, do not use on a real colony (D-119 follow-up)** — has hung/crashed AutoCAD on real colony sizes; use `close_polygons.py` instead |
| `CV-NEXT` | zooms/highlights each flagged gap in turn — only useful if flagging gaps some other way, since `close_polygons.py` reports its own flags |
| `CV-EXPLODE-BLOCKS` | explodes inserted blocks so their geometry can be selected/moved onto `COL-*` layers |
| `CV-SELECT-BY-PERIMETER` | selects entities by a perimeter/window pick, for bulk layer moves |

Standalone Python scripts (run on an exported DXF, reimport via `PASTEORIG` — no
dependency on `cv-tools.lsp`; `pip install -r tools/cad-lisp/requirements.txt` or reuse
`tools/pipeline`'s venv, which already has `ezdxf`/`shapely`):

| Script | Does |
|---|---|
| `close_polygons.py` | Replaces `CV-CLOSE` — bridges small gaps, traces every closed region onto `CV-PLOT-DRAFT` in one pass instead of a blind grid sweep, flags unresolved gaps onto `CV-FLAGS` |
| `derive_site.py` | Drafts a `COL-SITE` boundary onto `CV-SITE-DRAFT` by unioning every closed plot/garden/amenity/water/draft ring, buffering outward, falling back to a convex hull if clusters are still disconnected |
| `check_layers.py` | Preflight — mirrors `pipeline/extract/dxf.py`'s conformance checks (entity type, closure, `COL-SITE` count, one-label-per-polygon) directly against the working DXF, before a real `make ingest` run. Does not check north agreement or feature-label keyword classification (that's `pipeline.matching.classify`, M12) |
| `fill_missing_labels.py` | Auto-places `COL-FEATURE-NO` labels (a configurable default per layer) onto `CV-FEATURE-LABELS-DRAFT` for any `COL-GARDEN`/`COL-AMENITY` polygon that doesn't have one yet |
| `fix_plot_label_dashes.py` | Inserts the missing `-` in a `COL-PLOT-NO` label that already has a valid block letter directly followed by a number (`E14` → `E-14`) — purely mechanical (there's only one possible split), writes a new `<dxf>-dashfix.dxf`, never edits in place |
| `trace_site.py`, `triage_report.py`, `export_blocks.py` | Site-boundary tracing, a summary/triage report, and block-export helpers — see `tools/cad-lisp/README.md` for each script's own usage |
| `polygonize.py`, `labels.py`, `output.py` | Shared helpers (ring-tracing/gap-bridging, label reading, DXF-writing) reused by the scripts above — not run directly |

Phase 2 (not yet built): `CV-LABELS`, `CV-DIST`, `CV-EXPORT`. Untested against a live
AutoCAD session — Claude has no AutoCAD to verify against; the Python scripts were
smoke-tested by the owner against a real colony DWG (Jai Dev Residency, 2026-08-20), not
verified by Claude beyond byte-compiling — see PROGRESS.md.

## apps/map — layer boundaries

| Layer | Path | May import | May NOT |
|---|---|---|---|
| Data access | `apps/map/src/lib/db/` | supabase-js | React |
| Domain | `apps/map/src/lib/{plot-status,colony}/` | `lib/db`, `src/shared` | React, DOM |
| Sync | `apps/map/src/lib/sync/` | `lib/db` | components |
| Auth | `apps/map/src/lib/auth/` | `lib/db` | React, DOM. Calls `client.auth.*` directly (docs/plans/09.md) — not a `.from()` query, same precedent as Sync calling `client.channel()` directly. |
| Features | `apps/map/src/features/` | all `src/lib/*` | other features |
| Components | `apps/map/src/components/` | `src/shared` | `lib/db` |
| Pure | `apps/map/src/shared/` | nothing | everything |

`supabase.from(...)` appears only in `lib/db/`. Anywhere else is a review finding.

## tools/pipeline — the run, end to end

```
DWG ─(AutoCAD, by hand)─► DXF ─► extract ─► geom ─► matching ─► derive ─► export
                                                                            │
                                                       out/<colony>/ ───────┤
                                                         colony.svg         │
                                                         colony.json ───────┘
                                                                            │
                                         verify/index.html reads out/ ──────┘
                                              (local preview only)          │
                                                                            ▼
                                   a human uploads both files in the app, looks
                                   at the render, confirms → verified: true (M15)
```

Normalisation happens in AutoCAD, upstream of all code, per `docs/cad-layer-standard.md`
(D-118). A correction is made in the DXF and re-ingested — there is no override store, and
nothing downstream ever edits geometry.

`extract → geom → matching → derive → export` is fully wired as of M13 (2026-08-21) — the
one orchestration entry point is `pipeline.export.run.orchestrate_export`, called by
`pipeline/cli/export.py` (`make export COLONY=<id> DXF=<path>`). `tools/pipeline/verify/`
(spec/14, M14, built 2026-08-21) is a plain three-file, no-build-step page — no
orchestration entry point, nothing else calls into it. It fetches `../out/<id>/
colony.{svg,json}` and `../colonies/<id>.json` directly via `fetch()`, and reuses
`apps/map/src/styles/{colony-theme,plot-selection,map-texture}.css` unmodified (relative
`<link>`s) plus a hand-ported copy of the app's old SVG pattern-def logic in `verify.js`
(those app modules were deleted in the 2026-08-22 canvas rewrite; the verify page keeps its
own standalone copy and is unaffected — no import ever existed, since that module is
TypeScript compiled by the app's bundler). Both `serve` Makefile targets (root and
`tools/pipeline/Makefile`) serve the **repo root**, not just `verify/`, so those relative
fetches can resolve. Diagram above still holds: this is a read-only preview, never the
`verified: true` write — that stays the app's upload screen (M15, D-025).

`pipeline/geom/` imports no file-format library — no ezdxf, no fitz, no cv2, no PIL. That purity is
what makes it cheap to test, and every other module depends on it.

## Where do I change X?

| I want to change… | Go to | Tier |
|---|---|---|
| The SVG classes, id format, or manifest schema | `contract/` | 1 |
| Which transitions are legal | `apps/map/src/lib/plot-status/transitions.ts` | 1 |
| Conflict detection on a stale write | `apps/map/src/lib/plot-status/` | 1 |
| Cache expiry, the freshness indicator | `apps/map/src/lib/sync/` | 1 |
| Database schema, RLS policies | `apps/map/supabase/migrations/` | 1 |
| Login, username validation, session handling | `apps/map/src/lib/auth/` | 1 |
| Status colours, map theme | `apps/map/src/styles/colony-theme.css` | 3 |
| Selection/filter/dimension-callout styling on the SVG | `apps/map/src/styles/plot-selection.css` | 3 |
| Search/legend/share toolbar chrome (HTML overlay, not SVG) | `apps/map/src/styles/map-toolbar.css` | 3 |
| Plot detail sheet fields | `apps/map/src/features/plot-detail/` | 2 |
| How a plot number is matched to a polygon | `tools/pipeline/pipeline/matching/assign.py` | 1 |
| Plot vs garden vs amenity classification | `tools/pipeline/pipeline/matching/classify.py` | 1 |
| Y-flip and viewBox normalisation | `tools/pipeline/pipeline/export/normalise.py` | 1 |
| ~~How overrides are keyed and reapplied~~ | Cut — the DXF is the source of truth (D-118) | — |
| The QA checks that block an export | `tools/pipeline/pipeline/export/qa.py` | 1 |
| Ring validation, area, centroid, simplification | `tools/pipeline/pipeline/geom/` | 1 |
| Vector-vs-raster triage, `make inspect` | `tools/pipeline/pipeline/io/pdf.py`, `pipeline/cli/inspect.py` | 2/3 |
| Reading rings and labels from a DXF | `tools/pipeline/pipeline/extract/dxf.py` | 2 |
| The CAD layer standard the DXF must meet | `docs/cad-layer-standard.md` | 1 |
| ~~OpenCV contours and OCR~~ | Cut — a plan with no DWG is traced in AutoCAD (D-118) | — |
| Roads, trees, facing, corner | `tools/pipeline/pipeline/derive/` | 2 |
| ~~The tracing tools~~ | Cut — the operator has AutoCAD (D-118) | — |
| The local export preview | `tools/pipeline/verify/index.html`, `verify.js` | 3 |
| The human verification gate | `apps/map/src/features/colony-upload/` | 1 |
| How a colony's SVG reaches the app | `colonies.svg` column → `ColonyMap.tsx` | 1 |

## tools/pipeline — toolchain

`ruff`/`mypy`/`pytest` are not on this machine's global `PATH` (only bare `python` is —
D-117-adjacent, no confirmed shared Python toolchain yet). Every `tools/pipeline/Makefile`
target resolves them through a self-bootstrapping `.venv` (`python -m venv .venv` +
`pip install -e ".[dev]"`, triggered by a `$(VENV)/pyvenv.cfg` prerequisite) so
`make verify`/`make inspect`/etc. work cold with no manual activation step. Root `Makefile`
targets (`verify-pipe`, `contract`, `gate`, `inspect`) delegate to this nested Makefile via
`$(MAKE) -C tools/pipeline <target>` rather than duplicating bare tool invocations.

## Session tooling

| File | What it does |
|---|---|
| `.claude/preamble.sh` | Read-only helper the skills call to inline state into their `!` blocks. Claude Code's permission checker rejects any shell expansion (`\|\|`, pipes, `;`, `$(...)`, bare `$VAR`) inside those blocks, so all of it lives here behind one allow-list entry, invoked with a literal, hardcoded absolute path (`C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh`) — a relative path breaks the moment the shell's cwd drifts from repo root, which happened and broke `/wrap` on 2026-08-12. The script self-locates via `BASH_SOURCE` once running; do not reintroduce a `$CLAUDE_PROJECT_DIR` dependency, it is unset in this shell. Add a subcommand rather than putting shell back in a skill. |

## Feature index

| Feature | Domain logic | Data access | UI | Tables |
|---|---|---|---|---|
| Colony render, pan/zoom (M1; rewritten to canvas 2026-08-22, docs/plans/18.md, D-027) | `apps/map/src/components/map/colonyModel.ts` (SVG text → plain draw model; **no `Path2D`, no `getBBox`** so it parses under jsdom), `plotPicker.ts` (point-in-polygon, replaces DOM hit-testing), `view.ts` (pure view maths + `colonyLatLngBounds`/`leafletViewState`, the **only** place SVG space is bound to Leaflet) | none | `components/map/useColonyCanvas.ts` (Leaflet init, canvas layer, attachSync, picking, repaint scheduling) → `colonyCanvasLayer.ts` (an `L.Layer` owning a **viewport-sized** canvas — never colony-sized, that is the whole performance fix) → `drawColony.ts` + `drawLabels.ts` + `drawDimensions.ts`; textures in `canvasPatterns.ts`; colours resolved from CSS in `colonyTheme.ts`; `ColonyMap.tsx` owns React state and chrome only | none |
| Status colours (M2) | `apps/map/src/lib/colony/plotStatus.ts` | `apps/map/src/lib/db/` | `apps/map/src/components/ColonyMap.tsx` sets `data-status` | `colonies`, `plots`, `plot_history` |
| Plot detail sheet (M3) | `apps/map/src/lib/colony/plotDetail.ts` | `apps/map/src/lib/db/` | `apps/map/src/features/plot-detail/{PlotDetailSheet,PlotDetailContent}.tsx`, opened from `ColonyMap.tsx`'s `selectedId` | `plots`, `plot_history` (read-only) |
| Status writes/transitions (M4) | `apps/map/src/lib/plot-status/{transitions,recentEdit,applyPlotTransition}.ts` | `apps/map/src/lib/db/plotTransitions.ts` → `apply_plot_transition()` (Postgres function, `security definer`, one transaction, row-locked) | `features/plot-detail/PlotStatusActions.tsx` (Save/Undo buttons, called from `PlotDetailSheet.tsx`) | `plots`, `plot_history` (write) |
| Realtime sync + freshness indicator (M5) | `apps/map/src/lib/sync/{attachSync,subscribePlots,freshness}.ts` | `attachSync` reuses `loadPlotStatuses` (`lib/colony/plotStatus.ts`) for the initial load and reconnect refetch — `plots` added to the `supabase_realtime` publication in `20260815000000_m5_realtime_publication.sql` | `components/map/useColonyCanvas.ts` calls `attachSync` once per mount (the callback interface is unchanged); its `applyStatuses` also **counts orphaned `svg_id`s and surfaces them in the dev badge** — the SVG renderer silently no-op'd on those; `components/FreshnessIndicator.tsx` is presentational only | `plots` (read via subscription, no new writes) |
| Legend filter, search, share summary (M6) | `apps/map/src/lib/colony/{searchPlots,shareSummary}.ts` | `searchPlots.ts`/`shareSummary.ts` reuse `fetchPlotsByColony`/`fetchColonyById`/`fetchRecentHistoryForPlots` (`lib/db/{plots,colonies,plotHistory}.ts`) | `components/StatusLegend.tsx` (filter buttons, `ColonyMap.tsx` owns `activeStatuses` state; since 2026-08-22 it is passed into the renderer's draw state, not applied as `filter-*` classes — there is no SVG root any more); `features/search/PlotSearch.tsx` (loads its own index, calls back into `ColonyMap.tsx` to select+pan); `features/share-summary/ShareSummary.tsx` (loads on demand, copy-to-clipboard) | `plots`, `plot_history` (read-only; `fetchRecentHistoryForPlots` excludes `changed_by: "import"` rows) |
| Selected plot: scale, dimming, per-edge dimension callout, fly-to (M6, owner-requested; moved to canvas 2026-08-22) | `apps/map/src/lib/colony/plotGeometry.ts` — pure, DOM-free (`parsePlotPoints` reads **both** path grammars: the pipeline's `M x,y L x,y` and the fixture's `H`/`V` shorthand; rotating-calipers `minAreaRect`, `simplifyNearCollinear`, `polygonCentroid`) | `components/map/usePlotDimensions.ts` → `lib/db/plots.ts`'s `fetchPlotBySvgId` (two numbers only; the sheet loads its own row separately) | Selection styling is draw order in `components/map/drawColony.ts` (the selected plot is drawn **once**, at the end, scaled — never also in the main loop); the callout is `components/map/drawDimensions.ts`, one dashed line+label per real polygon edge | none |
| Plot-number label orientation/size (2026-08-21; folded into the draw model 2026-08-22) | none | none | `components/map/colonyModel.ts` reads `data-rotation`/`data-label-height` off each `.plot-label` (baked in by `pipeline/export/svg.py` from the source DXF's own label rotation/height) into the model; `components/map/drawLabels.ts` applies them. Both optional — falls back to upright at the default size, and for a fixture-style `transform="rotate(...)"` the model reads the rotation out of that instead. **Labels are culled to the viewport there, which is mandatory, not an optimisation: un-culled they were 55% of a frame.** | none |
| Multi-colony home screen / colony picker (docs/plans/06.md) | `apps/map/src/lib/colony/listColonies.ts` | `lib/db/colonies.ts`'s `fetchVerifiedColonies` | `apps/map/src/App.tsx` fetches the list once after the actor gate and owns `selectedColonyId`; `features/colony-picker/ColonyPicker.tsx` is presentational, renders the list and an empty/error state, calls back `onSelect(colonyId)`; `ColonyMap.tsx` takes `colonyId` as a prop (no longer a hardcoded module constant) | `colonies` (read-only, `verified = true` only — D-108 applied at the list level) |
| PWA install + offline reads (docs/plans/07.md, M7) | none — `src/pwa/` is persistence, not domain logic (see below) | `src/pwa/offlineCache.ts` (native IndexedDB, no dependency) — the only place offline plot-status/colony-list snapshots are written or read | `public/sw.js` (hand-written service worker, versioned `CACHE_NAME`, no Workbox); `src/pwa/registerServiceWorker.ts` (called once from `main.tsx`); `features/pwa-install/InstallInstructions.tsx` (one-time screen, gated by `pwa/installInstructionsSeen.ts` + `display-mode: standalone`); `lib/sync/attachSync.ts` and `App.tsx` fall back to the offline cache when the initial fetch fails while `navigator.onLine` is false | none — read-only, D-008 |
| Auth: username/password + RLS lockdown (docs/plans/09.md, M8) | `apps/map/src/lib/auth/{username,session}.ts` (D-019, D-020) | none new — sessions/reads go through the existing `lib/db/browserClient.ts` client; `scripts/create-user.ts` is the only writer of `auth.users`, via the service-role key | `App.tsx` owns the single app-lifetime Supabase client and the session gate (`getSession`/`onAuthStateChange`), replacing the old `!actor` gate; `features/auth/LoginScreen.tsx` (username/password form, shown whenever there is no session) | `auth.users` (via Admin API only); RLS on `colonies`/`plots`/`plot_history` is now select-only, authenticated-only — see `apply_plot_transition()`'s own comment for why writes still work |
| Plot table view + CSV initial-data import (docs/plans/10.md) | `apps/map/src/lib/colony/{bulkImportInitialPlotData,parseBulkImportFile}.ts` | `bulkImportInitialPlotData` → `lib/db/plots.ts`'s `callBulkSetInitialPlotData` → `bulk_set_initial_plot_data()` RPC (a second, narrowly-scoped `security definer` write path for `plots` — see that migration's comment, not a violation of invariant 4, which governs the operational transition path only) | `ColonyMap.tsx`'s toolbar "Table view" button opens `features/plot-table/PlotTableView.tsx` as a full-screen overlay (map stays mounted underneath, not torn down); `PlotTableRow.tsx` is the pure per-row presentational piece (mirrors `PlotStatusActions.tsx`), every row's edit still calls `applyPlotTransition()` independently; `features/bulk-import/BulkImportScreen.tsx` (CSV only in this build — XLSX deferred, see PROGRESS.md) is reachable from the table's toolbar | `plots`, `plot_history` (write, via the new RPC — only touches plots whose history is entirely `'import'`/`'bulk_import'` sentinels, never a plot with a real operational transition) |
| In-app colony onboarding (docs/plans/11.md, D-025, M15) | `apps/map/src/lib/colony/{svgPlotIds,parseColonyManifest,createColonyFromManifest}.ts` — `parseColonyManifest.ts` validates against the real `contract/colony.schema.json` via Ajv (`ajv/dist/2020`, imported `?raw`), never a hand-transcribed copy | `createColonyFromManifest` → `lib/db/colonies.ts`'s `callCreateColonyFromManifest` → `create_colony_from_manifest()` RPC (a third, narrowly-scoped `security definer` write path, shaped like `bulk_set_initial_plot_data` — always sets `verified: true`, since the upload screen's confirmation is what makes calling it at all equivalent to a human confirming; a replace only ever touches a plot's 7 geometry columns, never status/money/`version`/`updated_by`) | `ColonyPicker.tsx`'s "Upload a colony" button opens `features/colony-upload/ColonyUploadScreen.tsx` as a full-screen overlay; its confirmation preview renders through `components/map/renderColonyPreview.ts`, **the same renderer as the map by design** — a gate that verifies a different render than the map ships is not a gate (D-025); `App.tsx` passes the already-loaded colony row's `svg` field to `ColonyMap.tsx` as the `colonySvg` prop — `ColonyMap.tsx` no longer imports any fixture SVG at build time | `colonies` (write: insert/update via the RPC only), `plots`, `plot_history` (write, same sentinel/eligibility shape as the bulk-import RPC) |

## tools/pipeline — reusable functions

| Function | Path | What it does |
|---|---|---|
| `triage_pdf(path)` | `tools/pipeline/pipeline/io/pdf.py` | Opens a PDF/JPEG/PNG/TIFF and returns one `PageTriage` per page — vector-or-raster, drawing-path count, text-span count, bbox, rotation. Rejects any other extension with `UnreadablePdfError` before ever calling PyMuPDF (it happily parses Markdown/other formats too — out of scope for a site-plan triage tool, a real gap M9's own test caught). Never raises a raw PyMuPDF exception. |
| `classify_document(pages)` | `tools/pipeline/pipeline/cli/inspect.py` | `"vector"` if every page is vector, `"raster"` if none are, else `"mixed"` — the M9/spec-04 fork point (`make inspect`'s whole reason to exist). |
| `ingest_dxf(dxf_path, config)` | `tools/pipeline/pipeline/extract/dxf.py` | M10 (D-118): reads a conforming DXF's modelspace into `DxfIngestResult` (rings + labels + resolved `north_deg`), strict — every rejection names the layer and entity handle, never repairs or guesses. `ezdxf` types never cross past this module (tier-2.md, "format code stays at the edge"). |
| `load_colony_config(colony_id, colonies_dir)` | `tools/pipeline/pipeline/extract/dxf.py` | Loads and types `tools/pipeline/colonies/<id>.json` into `ColonyConfig`. |
| `Ring`, `Label`, `ColonyConfig`, `DxfIngestResult` | `tools/pipeline/pipeline/extract/types.py` | The neutral intermediate structure M11/M12 consume — plain dataclasses, deliberately importable with no `ezdxf` dependency (asserted by `tests/test_dxf.py::test_intermediate_types_do_not_need_ezdxf`, standing in for spec/10 criterion 7's `pipeline/geom` import test until M11 existed). |
| `validate_ring`, `validate_disjoint`, `validate_within`, `simplify`, `contains`, `centroid`, `area_sqft`, `nearest_edge_bearing`, `GeomError` | `tools/pipeline/pipeline/geom/__init__.py` | M11 (spec/11, `docs/plans/12.md`): pure geometry core, no file-format import. `validate_*` raise `GeomError` naming the entity handle (same idiom as `DxfConformanceError`), never return a bool. `validate_within` uses `covers` not `contains` (a perimeter plot's edge normally touches `COL-SITE`'s boundary). `validate_disjoint` is a naive O(n²) pairwise check — measured 41s at 1,500 plots vs 0.45s with an `STRtree`; now wired into `pipeline/export/qa.py::run_qa` (M13) without that fix, `/review`-verdict re-deferred until a real colony's plot count says otherwise (PROGRESS.md Deferred). |
| `match_labels_to_rings(noun, rings, labels)`, `MatchingError` | `tools/pipeline/pipeline/matching/__init__.py` | M12 (spec/12, `docs/plans/13.md`): the one containment test (via `pipeline.geom.contains`) shared by `assign.py` and `classify.py` — pairs each ring with the single label whose insertion point it contains, raising `MatchingError` naming the entity handle(s) for any zero/multi match either direction. The old contained→nearest→flag ladder is deleted; there is no distance-threshold fallback anywhere in this module. |
| `assign_plot_numbers(rings, labels, config)` → `PlotMatchResult` | `tools/pipeline/pipeline/matching/assign.py` | Plot identity: regex-validates each label (`^([A-Z]+-)?[0-9]+$`, rejects dimension strings), resolves block (bare number → `config.default_block`, which defaults to `config.blocks[0]` but may be `None` for a genuinely blockless colony, docs/plans/15.md; explicit prefix must be in `config.blocks`), checks `config.number_range` and `config.number_width` independently (a number can be in-range and still too wide to pad — that's an error, not a truncation), zero-pads, builds `svg_id` (`plot-{BLOCK}-{NN}`, or `plot-{NN}` when blockless), and errors on duplicate `svg_id`s across rings. `default_block_count`/`explicit_block_count` on the result is spec/12's required "report the split". |
| `classify_features(rings, labels)` → `tuple[ClassifiedFeature, ...]` | `tools/pipeline/pipeline/matching/classify.py` | Feature classification: `class` from the ring's layer (`COL-GARDEN`/`COL-AMENITY`/`COL-WATER`), `kind` from the `COL-FEATURE-NO` label matched case-insensitively against `_KEYWORD_TABLE` (codified from `docs/cad-layer-standard.md` — keep both, plus `contract/colony.schema.json`'s `kind` enum, in sync). `PARKING` is checked before `PARK` deliberately — it's a substring of it, so the reverse order silently misclassifies every parking lot as a park (a real `/review` finding, 2026-08-20). No area clustering, no "unclassified defaults to garden". |
| `derive_road(site, others)` | `tools/pipeline/pipeline/derive/roads.py` | M13 (spec/13, `docs/plans/14.md`): `site − union(others)`, one shapely difference. Never reads a road layer from the source (D-104) — there is none. |
| `scatter_trees(colony_id, areas)` → `tuple[Point, ...]`, `stable_seed(colony_id)` | `tools/pipeline/pipeline/derive/trees.py`, `tools/pipeline/pipeline/derive/__init__.py` | M13: seeded, deterministic tree placement — `stable_seed` uses `hashlib.sha256`, **not** the builtin `hash()` (salted per-process, would silently break the run-twice-identical-output requirement, D-105). `areas` order is part of the seeded stream — callers must pass a fixed order (road first, then gardens sorted by `ring.handle`). |
| `resolve_facing(plot, road, north_deg)`, `is_plot_corner(plot, road)` | `tools/pipeline/pipeline/derive/{facing,corner}.py` | M13: nearest-road-edge bearing snapped to 8 compass points, and a 2-or-more-non-parallel-touching-sides corner test. Both operate in raw drawing-space (feet), before `pipeline/export/normalise.py`'s transform. `facing`'s `+ north_deg` sign convention is taken on spec/13's literal text, not independently re-derived — unverifiable without a real north-marked DXF (PROGRESS.md Deferred). |
| `compute_transform(site)`, `apply_transform(t, point)` | `tools/pipeline/pipeline/export/normalise.py` | M13 (D-110): translate-flip-scale to a viewBox always exactly 1000px wide. The scale factor **is** `px_per_ft`, always derived from the site's real width here, never read from colony config (a deliberate deviation from spec/13's literal text — `docs/plans/14.md` §3). Every coordinate emitted anywhere (SVG paths, manifest centroids) goes through `apply_transform` — never duplicate this math. |
| `polygon_to_path_d(geom, t)` | `tools/pipeline/pipeline/export/svg_paths.py` | M13: `Polygon`/`MultiPolygon` (with holes) → one SVG compound path `d` string, every coordinate transformed. Shared by `svg.py` for site/road/plot/feature paths. |
| `build_svg(...)` | `tools/pipeline/pipeline/export/svg.py` | M13: assembles `colony.svg` per `contract/SPEC.md` — zero styling attributes outside its own fallback `<style>` block, which is scoped with `svg:root ` so it applies only when the file is opened standalone, never once the app inlines it into the live DOM (a real `/review` finding, 2026-08-21: an unscoped block out-cascaded `colony-theme.css`). Trees are `<use class="tree" href="#tree-canopy">` with explicit `width`/`height` (never omit — defaults to 100% viewport, already happened once) and a `class="tree-crown"` `<circle>` symbol def. Each plot's visible `plot-label` text is bare `int(plot.number)`, prefixed with `{block}-` only when the colony mixes more than one distinct `block` (docs/plans/16.md) — a single-block colony's labels are unchanged; this is independent of `svg_id`, which never collides regardless. |
| `build_manifest(...)`, `feature_svg_id(feature)` | `tools/pipeline/pipeline/export/manifest.py`, `tools/pipeline/pipeline/export/__init__.py` | M13: assembles `colony.json` per `contract/colony.schema.json`. `confidence` is always the literal `"manual"`, `verified` always `False`, hardcoded (D-108) — no parameter can set either otherwise. `feature_svg_id = f"{class}-{ring.handle.lower()}"` — the DXF handle, not label text, for stability across reruns (a gap M12 left open, filled here). `length_ft`/`breadth_ft` are always `sorted(rectangle sides)` — shorter first. |
| `run_qa(manifest, plots, config, svg, out_dir, allow_id_change)` | `tools/pipeline/pipeline/export/qa.py` | M13: the blocking QA gate — schema validation against `contract/colony.schema.json` (first check), duplicate/missing id (across plots **and** features), plot count vs `expected_plots`, `PLOT_AREA_SQFT_MIN`/`MAX = [300, 6000]` sanity band (replaces D-111's calibration — catches a DWG-in-mm-read-as-feet unit mismatch), `validate_disjoint` reuse, `number_width`, zero SVG styling attributes, and id-stability (refuses to drop a previous export's `svg_id` without `--allow-id-change`). All raise `ExportError` naming the offending value. |
| `orchestrate_export(colony_id, dxf_path, colonies_dir, out_dir, allow_id_change)` | `tools/pipeline/pipeline/export/run.py` | M13: the one function that calls the whole pipeline in order — ingest → geom validate → match → derive → export → QA → write. Builds both `colony.svg`/`colony.json` fully in memory and only writes either once `run_qa` passes (both files or neither); writes with explicit `encoding="utf-8"` (a real `/review` finding — `Path.write_text` with no encoding resolves to cp1252 on Windows, risking a mid-write crash on a non-ASCII `COL-FEATURE-NO` label). Called by `pipeline/cli/export.py` (`make export`). |

## Reusable functions

| Function | Path | What it does |
|---|---|---|
| `createDbClient(url, anonKey, options?)` | `apps/map/src/lib/db/client.ts` | Pure Supabase client factory — no `import.meta`/`process.env` reads. Safe from both Vite and tsx contexts. `options` (docs/plans/09.md) is unused by the real app — only live-integration tests pass `{ auth: { persistSession: false } }`/a unique `storageKey` (see `lib/auth/testHelpers.ts`), since GoTrue's default storage key is derived from the URL alone and would otherwise let two client instances in the same test file share (and cross-tab-sync) one session. |
| `getBrowserDbClient()` | `apps/map/src/lib/db/browserClient.ts` | Reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and calls `createDbClient`. Vite-only — never import this from `scripts/`. |
| `insertColony`, `fetchColonyById`, `fetchVerifiedColonies`, `insertPlots`, `fetchPlotStatuses`, `fetchPlotBySvgId`, `fetchPlotsByColony` | `apps/map/src/lib/db/{colonies,plots}.ts` | The only place `supabase.from()` appears. `fetchPlotsByColony` (M6) fetches every field for a colony in one call, ordered by `svg_id` (docs/plans/10.md — the table view's only ordering guarantee, since it doesn't filter/sort) — search and the share summary both need more than status. `fetchVerifiedColonies` (docs/plans/06.md) backs the home-screen picker — `.eq("verified", true)`, D-108 applied at the list level. |
| `insertPlotHistory`, `fetchPlotHistory`, `fetchRecentHistoryForPlots` | `apps/map/src/lib/db/plotHistory.ts` | Appends/reads history rows; the table itself rejects UPDATE/DELETE via a DB trigger, and the migration grants it no update/delete privilege either. `fetchRecentHistoryForPlots` (M6) excludes `changed_by: "import"` rows — those are `scripts/import-seed.ts`'s own bookkeeping, not a real change; the share summary must never present them as one (invariant 5). |
| `loadPlotStatuses(client, colonyId)` | `apps/map/src/lib/colony/plotStatus.ts` | Domain-shaped `{ svg_id: status }`. DOM-free by design — callers apply `data-status` themselves. Checks `colonies.verified` first (D-108) — returns `{}` for an unverified colony rather than the real statuses. |
| `loadPlotDetail(client, colonyId, svgId)` | `apps/map/src/lib/colony/plotDetail.ts` | Full plot row + its history, DOM-free — `PlotDetailSheet.tsx` owns rendering. Same `colonies.verified` check as `loadPlotStatuses` (D-108) — returns `null` for an unverified colony. |
| `loadVerifiedColonies(client)` | `apps/map/src/lib/colony/listColonies.ts` | Thin DOM-free wrapper around `fetchVerifiedColonies` — the list-level half of D-108, called once by `App.tsx` to build the home-screen picker's options. |
| `formatRupees`, `formatDate`, `formatRelativeTime`, `formatStatusLabel`, `formatPlotLabel` | `apps/map/src/shared/format.ts` | The "Pure" layer (imports nothing). Rupees exist only here (D-010); `formatRelativeTime` is pinned to `Asia/Kolkata` regardless of viewer's device timezone. `formatPlotLabel(plot)` returns `{block}-{number}`, or just `{number}` when `block` is `""` (a blockless plot, docs/plans/15.md) — the one place that join happens, reused by `PlotDetailContent.tsx`, `PlotTableRow.tsx`, `searchPlots.ts`, `shareSummary.ts`. Unit-tested in `format.test.ts`. |
| `formatFreshnessLabel(lastSyncedAt, now, online)` | `apps/map/src/lib/sync/freshness.ts` | Genuinely relative age string ("Updated 2 min ago", "Offline — last synced 3h ago") — deliberately separate from `formatRelativeTime`, which renders an absolute clock time instead. Unit-tested in `freshness.test.ts`. |
| `saveSnapshot`, `loadSnapshot`, `saveColonyList`, `loadColonyList` | `apps/map/src/pwa/offlineCache.ts` | Native IndexedDB, no wrapper dependency — the only place offline reads are persisted (M7, D-008: read-only). `attachSync.ts` and `App.tsx` call these when the live fetch fails while `navigator.onLine` is false; both callers surface the snapshot's own `savedAt` through `formatFreshnessLabel`, never "now". Unit-tested in `offlineCache.test.ts` against `fake-indexeddb`. |
| `subscribePlotChanges(client, colonyId, handlers)` | `apps/map/src/lib/sync/subscribePlots.ts` | Opens one `postgres_changes` channel (`UPDATE` on `plots`, filtered to one colony) with a topic suffixed by a random id per call (docs/plans/10.md — supabase-js reuses a channel object for a repeated topic string, and `.on()` on an already-subscribed channel throws; two callers subscribed to the same colony at once, e.g. `attachSync` and `PlotTableView`, would otherwise collide and crash the whole tree with no error boundary). Returns an unsubscribe function. Callers: `attachSync`, `features/plot-table/PlotTableView.tsx`. |
| `attachSync(client, colonyId, callbacks)` | `apps/map/src/lib/sync/attachSync.ts` | Wires the realtime subscription, offline/online + channel-status signals, reconnect refetch, and the freshness tick into one cleanup function. `ColonyMap.tsx` is the only caller — supplies DOM-write callbacks and React state setters, owns no sync logic itself. |
| `applyPlotTransition(client, input)` | `apps/map/src/lib/plot-status/applyPlotTransition.ts` | The **only** path that writes `plots.status` (D-006, D-013, D-020). Returns a typed `PlotTransitionResult` — `illegal_transition`/`conflict` are return values, never thrown. Nothing else may call `callApplyPlotTransition` or the `apply_plot_transition` RPC directly. `input.ownerName` (docs/plans/08.md) is coalesced, never overwritten with null — set it only on a fresh `available → booked` transition; omitting it on every other call (including Undo) is what makes Undo-into-booked restore the last-written buyer with no re-prompt. No `actor`/`p_actor` field exists (docs/plans/09.md, D-020) — attribution is derived server-side inside the RPC from the caller's session. |
| `isLegalTransition(from, to)` | `apps/map/src/lib/plot-status/transitions.ts` | The amended D-013 table. No self-transitions. |
| `isRecentlyEdited(updatedAt, now)`, `RECENT_EDIT_WARNING_MINUTES` | `apps/map/src/lib/plot-status/recentEdit.ts` | Pinned at 5 minutes (spec/04) — not yet wired into any UI warning banner. |
| `callApplyPlotTransition(client, args)` | `apps/map/src/lib/db/plotTransitions.ts` | The only place `apply_plot_transition` is called via `.rpc()`. |
| `usernameToEmail(username)` | `apps/map/src/lib/auth/username.ts` | Pure — `{username}@colony.local` (D-019), validated `^[a-z0-9_-]{2,32}$`. The one place this validation lives; reused by `LoginScreen.tsx` and `scripts/create-user.ts`. Unit-tested in `username.test.ts`. |
| `signIn(client, username, password)`, `signOut(client)`, `getDisplayName(session)` | `apps/map/src/lib/auth/session.ts` | `signIn` maps every GoTrue failure to one generic message (no username/password enumeration). `getDisplayName` must mirror `apply_plot_transition()`'s own coalesce exactly (`app_metadata.display_name`, then email — **not** `user_metadata`, which is self-writable by the signed-in user, a real `/review` finding) — checked at both ends so a user's own name never disagrees with what the database just attributed to them. Returns `string \| null`, never a placeholder like `"unknown"`; `App.tsx` signs out on `null`. |
| `isSnapshotExpired(savedAt, now)`, `OFFLINE_CACHE_MAX_AGE_MS` | `apps/map/src/pwa/offlineCache.ts` | Pinned at 24h (docs/plans/09.md, spec/08 criterion 5) — same number as the auth session timebox, deliberately. `attachSync.ts` and `App.tsx` both call `client.auth.signOut()` when a snapshot is found expired, which is the actual "forces re-auth" mechanism. Unit-tested in `offlineCache.test.ts`. |
| `createScratchUser(displayName)`, `deleteScratchUser(user)`, `serviceRoleClient()`, `createStatelessAnonClient()` | `apps/map/src/lib/auth/testHelpers.ts` | Test-only, not imported from any app code. `createScratchUser` signs in with a per-user `storageKey` (GoTrue's default key is derived from the URL alone — two default-key clients in one test file silently share/cross-tab-sync one session otherwise). Reused by `applyPlotTransition.test.ts`, `rls.test.ts`, `subscribePlots.test.ts`, and the `lib/colony/*.test.ts` D-108 gate tests — create scratch users in `beforeAll`/tear down in `afterAll`, not per-`it`, or a failing assertion leaks the account (a real `/review` finding). |
| `buildSearchIndex(plots)`, `searchPlots(index, query)`, `loadSearchIndex(client, colonyId)` | `apps/map/src/lib/colony/searchPlots.ts` | `buildSearchIndex`/`searchPlots` are pure and unit-tested (`searchPlots.test.ts`); the whole colony is loaded into memory once, every keystroke after that is a pure filter, no server round trip. |
| `loadShareSummaryData(client, colonyId)`, `formatShareSummary(data, now?)` | `apps/map/src/lib/colony/shareSummary.ts` | `formatShareSummary` is pure and unit-tested (`shareSummary.test.ts`) — the literal WhatsApp text block, sentence case, no product-marketing tone. |
| `buildGrassPattern(ctx, image)`, `buildRoadPattern(ctx, baseColor)` | `apps/map/src/components/map/canvasPatterns.ts` | Canvas patterns for the map's ground/road textures, replacing the SVG `<pattern>` defs on 2026-08-22. Same owner-supplied photo, same 2x2 mirror scheme, same 160x144 tile and 1-unit seam overlap — a mirrored tile has no seam regardless of whether the source photo tiles. Baked once into an offscreen canvas, then `createPattern`. The separate world-ground layer is gone: the painter simply fills the visible world rect with ground first, so texture never runs out however far you pan. |
| `drawLabels(ctx, model, theme, state, bounds)` | `apps/map/src/components/map/drawLabels.ts` | Draws plot/feature/entrance labels (measured with `measureText`, no `getBBox` and so no layout dependency — the old SVG version had to defer a frame for that). No background chip since 2026-08-23 (owner reference) — feature labels render in `--colony-feature-label-ink` directly, which is why that token is light now. **Culls to the viewport, which is required, not an optimisation:** un-culled labels measured 20.6ms of a 37.5ms frame. Every size here is in SVG user units, matching the CSS it replaced. |
| `roundedPlotPath(plot)` | `apps/map/src/components/map/plotPath.ts` | Builds/caches (per-shape `WeakMap`) a `Path2D` with softly rounded corners from a plot's own points, via `roundedPolygonCorners()` below. `drawColony.ts`'s `plotPathFor()` calls this for every plot **except** one whose `svg_id` is in `state.cornerPlots` — a real corner plot's own angled cut is the shape it's sold on and is drawn from its raw `d` instead (owner ask, 2026-08-22). |
| `roundedPolygonCorners(points, maxRadius)` | `apps/map/src/lib/colony/plotGeometry.ts` | Pure — one `{p1, corner, p2, radius}` per vertex for the draw layer to turn into `moveTo`/`lineTo`/`arcTo`. `radius` is clamped per-corner to half of each adjacent edge, so it degrades gracefully on a tiny plot. Can't build `Path2D` here (jsdom, see `parsePlotPoints` above). |
| `gardenBlobsFor(shape)` | `apps/map/src/components/map/gardenDecoration.ts` | Deterministic (seeded from the shape's own `d` string, cached per-shape) scatter of two-tone circles standing in for tree/bush massing inside a `garden` polygon — there is no per-colony photo for gardens the way `canvasPatterns.ts`'s grass texture has one for the ground, so this generates one. Seeded so a repaint (every frame during a gesture) never re-rolls the layout. |
| `fetchCornerPlotIds(client, colonyId)` | `apps/map/src/lib/db/plots.ts` | svg_ids where `is_corner = true`. A **one-time** fetch, not a realtime subscription like `fetchPlotStatuses` — `is_corner` is computed once at import and never recomputed (tier-2.md), so it cannot go stale after the one read at mount (`useColonyCanvas.ts`). |
| `parseNullablePaise(value)` | `apps/map/src/shared/parsePaise.ts` | The one place a free-text paise string is validated (D-010) — a regex gate, not just `Number.isInteger(parseInt(...))`, so `"12.5"` is rejected rather than silently truncated. Shared by `scripts/import-seed.ts` and `lib/colony/parseBulkImportFile.ts` (docs/plans/10.md) so the two never diverge on what counts as valid. Unit-tested in `parsePaise.test.ts`. |
| `parseBulkImportCsv(raw)`, `parseBulkImportRows(rows)` | `apps/map/src/lib/colony/parseBulkImportFile.ts` | Pure CSV parser for the initial-data import (docs/plans/10.md) — fixed, order-sensitive header contract, no column mapping. `parseBulkImportRows` takes pre-split cells so an XLSX adapter (not yet built, see PROGRESS.md Deferred) can share the same validation. A file with any row error is rejected outright. Unit-tested in `parseBulkImportFile.test.ts`. |
| `bulkImportInitialPlotData(client, colonyId, rows)` | `apps/map/src/lib/colony/bulkImportInitialPlotData.ts` | Domain wrapper around `callBulkSetInitialPlotData` (`lib/db/plots.ts`), which is the only place `bulk_set_initial_plot_data` is called via `.rpc()`. `features/bulk-import/BulkImportScreen.tsx` is the only caller. Live-integration tests in `bulkImportInitialPlotData.test.ts`. |
| `extractSvgPlotIds(svgRaw)` | `apps/map/src/lib/colony/svgPlotIds.ts` | Regex-extracts every `plot-*` id from raw SVG markup. Shared by `scripts/import-seed.ts` and `lib/colony/parseColonyManifest.ts`'s `checkSvgIdsAgree` (docs/plans/11.md) so the manifest/SVG identity check can never drift between the Node script and the browser upload screen. |
| `parseColonyModel(raw)` | `apps/map/src/components/map/colonyModel.ts` | Parses colony SVG text into the renderer's draw model: plots (`id`, `d`, points, bbox), decor by class, labels. Holds **no `Path2D` and calls no `getBBox`** on purpose — it must parse under jsdom, and a model needing a live browser cannot be unit-tested. Drops trees (`isTree`). `contract/SPEC.md`'s class/`data-*` table is its input schema. |
| `pickPlotAt(model, x, y)` | `apps/map/src/components/map/plotPicker.ts` | Which plot is under an SVG-space point. Point-in-polygon with a bbox pre-check, 0.028ms/click over 675 plots. Chosen over a colour-key pick buffer (0.013ms) because that buffer is a snapshot of one view and must be rebuilt on every pan/zoom; this has nothing to invalidate. Iterates last-to-first so the plot drawn on top wins a tie. |
| `resolveColonyTheme(root?)` | `apps/map/src/components/map/colonyTheme.ts` | Reads every `--colony-*` custom property out of `styles/colony-theme.css` into a plain object. **D-004's enforcement point** now that no stylesheet paints the map — a colour literal in a draw call would break the one-variable guarantee silently. An unresolvable variable renders magenta rather than a plausible grey. |
| `renderColonyPreview(container, svg)` | `apps/map/src/components/map/renderColonyPreview.ts` | Still, non-interactive render of a colony for the upload screen's confirmation. Shares the model, theme, patterns and painter with the live map **deliberately**: that confirmation is the only code path writing `verified: true` (D-025, invariant 2), so it must show what the map will show. |
| `createColonyFromManifest(client, manifest, svg, replace)` | `apps/map/src/lib/colony/createColonyFromManifest.ts` | Domain wrapper around `callCreateColonyFromManifest` (`lib/db/colonies.ts`), the only place `create_colony_from_manifest` is called via `.rpc()`. `features/colony-upload/ColonyUploadScreen.tsx` is the only caller. Live-integration tests in `createColonyFromManifest.test.ts`. |

## Scripts

| Script | Path | What it does |
|---|---|---|
| `pnpm import:seed` | `apps/map/scripts/import-seed.ts` | One-off initial load: manifest + `seed/plot-status-seed.csv` → `colonies`/`plots`/`plot_history`. Refuses `verified: false`; validates `svg_id` orphans both ways against `colony.svg` and the CSV. Not the app's write path — that's M4. Uses `SUPABASE_SERVICE_ROLE_KEY` (docs/plans/09.md), not the anon key — anon/authenticated have no insert grant on `colonies`/`plots` since the M8 RLS lockdown. |
| `pnpm create-user <username> <password> "<Display Name>"` | `apps/map/scripts/create-user.ts` | The **only** way an account comes to exist (D-019) — `enable_signup = false`, so an admin-created `auth.users` row via this script is the allowlist. Service-role key, `email_confirm: true`. |

## Shared fixtures

| File | What it is |
|---|---|
| `fixtures/shree-vatika-2/colony.svg` | 26-plot real colony. Geometry only, no styling. |
| `fixtures/shree-vatika-2/colony.dxf` | **Not yet produced.** The normalised DXF the golden test ingests (D-118). |
| `fixtures/shree-vatika-2/colony.json` | Manifest. Validates against the schema. |
| `fixtures/demo-plan.pdf` | Synthetic vector plan. Input to `make inspect` (M9) only — no longer a pipeline source. |
| `fixtures/demo-plan-scan.jpg` | The same plan degraded. Exercises `make inspect`'s raster branch; the raster fallback it was for is cut (D-118). |
| `seed/plot-status-seed.csv` | Demo statuses, owners, brokers. |

One copy of each, used by both halves. The pipeline's golden test asserts it reproduces the
same 26 plot ids and centroids the app renders. Two copies would drift; this is the failure
that motivated merging the two original repos.
