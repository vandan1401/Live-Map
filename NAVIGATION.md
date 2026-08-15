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
| Auth | `apps/map/src/lib/auth/` | `lib/db` | React, DOM. Calls `client.auth.*` directly (docs/plans/09.md) — not a `.from()` query, same precedent as Sync calling `client.channel()` directly. |
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
| Login, username validation, session handling | `apps/map/src/lib/auth/` | 1 |
| Status colours, map theme | `apps/map/src/styles/colony-theme.css` | 3 |
| Selection/filter/dimension-callout styling on the SVG | `apps/map/src/styles/plot-selection.css` | 3 |
| Search/legend/share toolbar chrome (HTML overlay, not SVG) | `apps/map/src/styles/map-toolbar.css` | 3 |
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
| Status writes/transitions (M4) | `apps/map/src/lib/plot-status/{transitions,recentEdit,applyPlotTransition}.ts` | `apps/map/src/lib/db/plotTransitions.ts` → `apply_plot_transition()` (Postgres function, `security definer`, one transaction, row-locked) | `features/plot-detail/PlotStatusActions.tsx` (Save/Undo buttons, called from `PlotDetailSheet.tsx`) | `plots`, `plot_history` (write) |
| Realtime sync + freshness indicator (M5) | `apps/map/src/lib/sync/{attachSync,subscribePlots,freshness}.ts` | `attachSync` reuses `loadPlotStatuses` (`lib/colony/plotStatus.ts`) for the initial load and reconnect refetch — `plots` added to the `supabase_realtime` publication in `20260815000000_m5_realtime_publication.sql` | `ColonyMap.tsx` calls `attachSync` once per mount, supplying DOM-write callbacks and React state setters; `components/FreshnessIndicator.tsx` is presentational only | `plots` (read via subscription, no new writes) |
| Legend filter, search, share summary (M6) | `apps/map/src/lib/colony/{searchPlots,shareSummary}.ts` | `searchPlots.ts`/`shareSummary.ts` reuse `fetchPlotsByColony`/`fetchColonyById`/`fetchRecentHistoryForPlots` (`lib/db/{plots,colonies,plotHistory}.ts`) | `components/StatusLegend.tsx` (filter buttons, `ColonyMap.tsx` owns `activeStatuses` state and applies `filter-*` classes to the SVG root); `features/search/PlotSearch.tsx` (loads its own index, calls back into `ColonyMap.tsx` to select+pan); `features/share-summary/ShareSummary.tsx` (loads on demand, copy-to-clipboard) | `plots`, `plot_history` (read-only; `fetchRecentHistoryForPlots` excludes `changed_by: "import"` rows) |
| Selected-plot overlay: raise, dimension arrows, auto pan/zoom (M6, owner-requested) | none — DOM-only presentation | none | `components/useSelectedPlotOverlay.ts` (hook, called once from `ColonyMap.tsx`), `components/plotDimensionOverlay.ts` (SVG-building helpers for the length/breadth arrows) | none |
| Multi-colony home screen / colony picker (docs/plans/06.md) | `apps/map/src/lib/colony/listColonies.ts` | `lib/db/colonies.ts`'s `fetchVerifiedColonies` | `apps/map/src/App.tsx` fetches the list once after the actor gate and owns `selectedColonyId`; `features/colony-picker/ColonyPicker.tsx` is presentational, renders the list and an empty/error state, calls back `onSelect(colonyId)`; `ColonyMap.tsx` takes `colonyId` as a prop (no longer a hardcoded module constant) | `colonies` (read-only, `verified = true` only — D-108 applied at the list level) |
| PWA install + offline reads (docs/plans/07.md, M7) | none — `src/pwa/` is persistence, not domain logic (see below) | `src/pwa/offlineCache.ts` (native IndexedDB, no dependency) — the only place offline plot-status/colony-list snapshots are written or read | `public/sw.js` (hand-written service worker, versioned `CACHE_NAME`, no Workbox); `src/pwa/registerServiceWorker.ts` (called once from `main.tsx`); `features/pwa-install/InstallInstructions.tsx` (one-time screen, gated by `pwa/installInstructionsSeen.ts` + `display-mode: standalone`); `lib/sync/attachSync.ts` and `App.tsx` fall back to the offline cache when the initial fetch fails while `navigator.onLine` is false | none — read-only, D-008 |
| Auth: username/password + RLS lockdown (docs/plans/09.md, M8) | `apps/map/src/lib/auth/{username,session}.ts` (D-019, D-020) | none new — sessions/reads go through the existing `lib/db/browserClient.ts` client; `scripts/create-user.ts` is the only writer of `auth.users`, via the service-role key | `App.tsx` owns the single app-lifetime Supabase client and the session gate (`getSession`/`onAuthStateChange`), replacing the old `!actor` gate; `features/auth/LoginScreen.tsx` (username/password form, shown whenever there is no session) | `auth.users` (via Admin API only); RLS on `colonies`/`plots`/`plot_history` is now select-only, authenticated-only — see `apply_plot_transition()`'s own comment for why writes still work |

## Reusable functions

| Function | Path | What it does |
|---|---|---|
| `createDbClient(url, anonKey, options?)` | `apps/map/src/lib/db/client.ts` | Pure Supabase client factory — no `import.meta`/`process.env` reads. Safe from both Vite and tsx contexts. `options` (docs/plans/09.md) is unused by the real app — only live-integration tests pass `{ auth: { persistSession: false } }`/a unique `storageKey` (see `lib/auth/testHelpers.ts`), since GoTrue's default storage key is derived from the URL alone and would otherwise let two client instances in the same test file share (and cross-tab-sync) one session. |
| `getBrowserDbClient()` | `apps/map/src/lib/db/browserClient.ts` | Reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and calls `createDbClient`. Vite-only — never import this from `scripts/`. |
| `insertColony`, `fetchColonyById`, `fetchVerifiedColonies`, `insertPlots`, `fetchPlotStatuses`, `fetchPlotBySvgId`, `fetchPlotsByColony` | `apps/map/src/lib/db/{colonies,plots}.ts` | The only place `supabase.from()` appears. `fetchPlotsByColony` (M6) fetches every field for a colony in one call — search and the share summary both need more than status. `fetchVerifiedColonies` (docs/plans/06.md) backs the home-screen picker — `.eq("verified", true)`, D-108 applied at the list level. |
| `insertPlotHistory`, `fetchPlotHistory`, `fetchRecentHistoryForPlots` | `apps/map/src/lib/db/plotHistory.ts` | Appends/reads history rows; the table itself rejects UPDATE/DELETE via a DB trigger, and the migration grants it no update/delete privilege either. `fetchRecentHistoryForPlots` (M6) excludes `changed_by: "import"` rows — those are `scripts/import-seed.ts`'s own bookkeeping, not a real change; the share summary must never present them as one (invariant 5). |
| `loadPlotStatuses(client, colonyId)` | `apps/map/src/lib/colony/plotStatus.ts` | Domain-shaped `{ svg_id: status }`. DOM-free by design — callers apply `data-status` themselves. Checks `colonies.verified` first (D-108) — returns `{}` for an unverified colony rather than the real statuses. |
| `loadPlotDetail(client, colonyId, svgId)` | `apps/map/src/lib/colony/plotDetail.ts` | Full plot row + its history, DOM-free — `PlotDetailSheet.tsx` owns rendering. Same `colonies.verified` check as `loadPlotStatuses` (D-108) — returns `null` for an unverified colony. |
| `loadVerifiedColonies(client)` | `apps/map/src/lib/colony/listColonies.ts` | Thin DOM-free wrapper around `fetchVerifiedColonies` — the list-level half of D-108, called once by `App.tsx` to build the home-screen picker's options. |
| `formatRupees`, `formatDate`, `formatRelativeTime`, `formatStatusLabel` | `apps/map/src/shared/format.ts` | The "Pure" layer (imports nothing). Rupees exist only here (D-010); `formatRelativeTime` is pinned to `Asia/Kolkata` regardless of viewer's device timezone. Unit-tested in `format.test.ts`. |
| `formatFreshnessLabel(lastSyncedAt, now, online)` | `apps/map/src/lib/sync/freshness.ts` | Genuinely relative age string ("Updated 2 min ago", "Offline — last synced 3h ago") — deliberately separate from `formatRelativeTime`, which renders an absolute clock time instead. Unit-tested in `freshness.test.ts`. |
| `saveSnapshot`, `loadSnapshot`, `saveColonyList`, `loadColonyList` | `apps/map/src/pwa/offlineCache.ts` | Native IndexedDB, no wrapper dependency — the only place offline reads are persisted (M7, D-008: read-only). `attachSync.ts` and `App.tsx` call these when the live fetch fails while `navigator.onLine` is false; both callers surface the snapshot's own `savedAt` through `formatFreshnessLabel`, never "now". Unit-tested in `offlineCache.test.ts` against `fake-indexeddb`. |
| `subscribePlotChanges(client, colonyId, handlers)` | `apps/map/src/lib/sync/subscribePlots.ts` | Opens one `postgres_changes` channel (`UPDATE` on `plots`, filtered to one colony), returns an unsubscribe function. `attachSync` is the only caller. |
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
| `buildGardenPatternDefs(url)`, `buildRoadPatternDefs()`, `buildWorldGroundSvg(url, w, h)`, `computeWorldLayerBounds(viewBoxW, viewBoxH)` | `apps/map/src/components/mapTexturePatterns.ts` | SVG `<pattern>`/`<defs>` builders for the map's ground/road textures — `buildGardenPatternDefs`/`buildWorldGroundSvg` deliberately use disjoint pattern ids (`texture-garden` vs `texture-grass`): SVG ids are unique per *document*, and both the site SVG and the world-ground SVG are two sibling Leaflet overlays in the same live DOM. `buildMirroredPhotoPattern` (not exported) 2x2-mirror-tiles an arbitrary photo so it has no seam regardless of whether the source itself tiles, with a small `SEAM_OVERLAP` between the four quadrant `<image>`s to hide antialiasing hairlines at the joins. `ColonyMap.tsx` is the only caller. |
| `addFeatureLabelChips(svg)` | `apps/map/src/components/mapLabelChips.ts` | Inserts a white `<rect>` chip (from each label's own `getBBox()`) behind every `.feature-label` — road/quadrant name labels only, not plot numbers. Must be called after the SVG is actually attached to the document (`getBBox()` measures 0x0 immediately after `L.svgOverlay().addTo(map)` — attached isn't laid out yet); `ColonyMap.tsx` defers the call one `requestAnimationFrame`. |

## Scripts

| Script | Path | What it does |
|---|---|---|
| `pnpm import:seed` | `apps/map/scripts/import-seed.ts` | One-off initial load: manifest + `seed/plot-status-seed.csv` → `colonies`/`plots`/`plot_history`. Refuses `verified: false`; validates `svg_id` orphans both ways against `colony.svg` and the CSV. Not the app's write path — that's M4. Uses `SUPABASE_SERVICE_ROLE_KEY` (docs/plans/09.md), not the anon key — anon/authenticated have no insert grant on `colonies`/`plots` since the M8 RLS lockdown. |
| `pnpm create-user <username> <password> "<Display Name>"` | `apps/map/scripts/create-user.ts` | The **only** way an account comes to exist (D-019) — `enable_signup = false`, so an admin-created `auth.users` row via this script is the allowlist. Service-role key, `email_confirm: true`. |

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
