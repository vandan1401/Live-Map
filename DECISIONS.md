# Decisions

Index only. Append-only — never edit a past row. To change a decision, add a new row and
mark the old one `superseded by D-NNN`. Full reasoning and rejected alternatives live in
`docs/decisions/`, loaded on demand.

Two ranges: **D-0xx** decisions about `apps/map`, **D-1xx** about `tools/pipeline`. The gap
is deliberate — it makes the origin of a cross-reference obvious at a glance.

## apps/map

| ID | Decision | Status |
|---|---|---|
| D-001 | PWA on Cloudflare Pages, not a native iOS app | accepted |
| D-002 | Supabase Postgres as the data store, not Google Sheets | accepted |
| D-003 | Supabase Auth magic links, not Cloudflare Access | accepted |
| D-004 | Colony SVGs carry geometry only — no styling attributes | accepted |
| D-005 | Only plots live in Postgres; roads, gardens, amenities ship as static files | accepted |
| D-006 | Optimistic concurrency via `version`; stale writes fail loudly | accepted |
| D-007 | Attribution, not restriction — all users are equal admins | accepted |
| D-008 | Read-only offline; writes require connectivity | provisional |
| D-009 | Leaflet `CRS.Simple` as a pan/zoom container only, not its vector layer | accepted |
| D-010 | Money stored as integer paise | accepted |
| D-011 | Auth deferred to M8; app must not be publicly deployed before it | accepted |
| D-012 | Plot field set derived from the owner's stated needs | provisional |
| D-013 | Three-status vocabulary with defined legal transitions | provisional |
| D-014 | pnpm + Vite + Vitest + Wrangler | provisional |
| D-015 | No photos or documents per plot in v1 | provisional |
| D-016 | Actor identity is a client-supplied free-text string until M8 | provisional |
| D-017 | Shared fixture is a real, hand-traced colony — not pipeline-generated | provisional |
| D-018 | `owner_name` is sticky — never cleared by a status transition, only overwritten by a fresh booking | provisional |

## tools/pipeline

| ID | Decision | Status |
|---|---|---|
| D-101 | PDF-first pipeline, not DXF-first | accepted |
| D-102 | Vector PDF path is primary; raster is the fallback | accepted |
| D-103 | OpenCV contours for geometry, never a vision model | accepted |
| D-104 | Roads derived by subtraction, never extracted | accepted |
| D-105 | Trees generated procedurally from a per-colony seed | accepted |
| D-106 | Approximate geometry accepted; topology must be exact | accepted |
| D-107 | Overrides keyed by rounded centroid, reapplied every run | accepted |
| D-108 | No export is a deliverable until a human has verified it | accepted |
| D-109 | Output contract pinned — now `contract/`, shared by both halves | accepted |
| D-110 | Normalise to viewBox width 1000 with a Y-axis flip | accepted |
| D-111 | Scale recovered by two-point calibration, not from CAD units | accepted |
| D-112 | `facing` and `is_corner` derived once at export, then stored | accepted |
| D-113 | Local only — no cloud OCR, no GPU, no hosted inference | accepted |
| D-114 | Verify page is three files, not one | accepted |
| D-115 | DXF front end deferred and conditional on evidence | accepted |
| D-116 | Source provenance recorded in every manifest | accepted |
| D-117 | Makefile + pytest + ruff + mypy, stdlib venv | provisional |

## Both

| ID | Decision | Status |
|---|---|---|
| D-201 | One repo, not two — the contract is a shared schema, not mirrored prose | accepted |
