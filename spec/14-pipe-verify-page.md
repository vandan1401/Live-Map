# M14 — The local preview page

**Tier 2** (`tools/pipeline/verify/`).

Rewritten twice. Under D-118 the editing tools went — a correction is made in the DXF and
re-ingested, so anything fixed outside it would be lost on the next run. Under **D-025 the
human gate moved into the app's upload screen (M15)**, where a family member without AutoCAD
can actually exercise it. What remains here is a fast local preview for the owner's own
fix-and-rerun loop, which is what made this page worth having in the first place.

Dropping to Tier 2 follows from that: it no longer gates a deliverable.

## Goal

Open one HTML file and see what the pipeline just produced, without pushing it anywhere —
so a bad export is caught during the AutoCAD loop rather than at upload.

## Build

- Three files — `index.html`, `verify.js`, `verify.css` — opened directly from `file://`,
  no build step, no server beyond `make serve` for CORS-free fetches (D-114). Renamed from
  `tracer.js` since nothing traces any more.
- Load `tools/pipeline/out/<colony>/colony.svg` + `colony.json` and render them **exactly as
  the app will**, using the app's own stylesheet. The failure this catches is one that only
  appears after export — a mirrored Y-flip (D-110), a wrong `px_per_ft`, a plot that lost its
  number between the DXF and the manifest. All of those look perfectly correct in AutoCAD.
- Side-by-side counters: plots, gardens, amenities, water, and total site area. Compare
  against `expected_plots` from the colony config and show a mismatch loudly.
- Click any plot: show its `svg_id`, `area_sqft`, `length_ft` × `breadth_ft`, `facing`, and
  `is_corner`. `facing` and areas are the fields the family reads and quotes, and they are
  derived (M13) rather than drawn — this is the only place a human ever sees them before
  they reach the app.
- A "compare to source" toggle that overlays the plan image behind the render at the same
  extents, if one is present at `out/<colony>/source.png`. Eyeballing the render against the
  plan is the actual verification act; everything else is bookkeeping.
- **No "Mark verified" button.** The pipeline only ever emits `"verified": false`, and the
  single code path that writes `true` is M15's upload confirmation, in front of the rendered
  map (D-025). A local button would enforce the gate against a file rather than a person —
  and would be useless to the family member doing the upload.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Opens from `file://` with no build step | Manual |
| 2 | Shree Vatika fixture renders 26 plots, counters agree with the manifest | Manual, after `make ingest COLONY=shree-vatika-2` |
| 3 | A manifest doctored to 25 plots against `expected_plots: 26` shows the mismatch loudly | Manual with a doctored manifest |
| 4 | A deliberately Y-flipped export is visibly mirrored against the source overlay | Manual |
| 5 | Nothing in `tools/pipeline` ever writes `verified: true` | `grep` across `tools/pipeline` |
| 6 | Opening the page leaves the manifest byte-identical | `diff` before and after |

## Non-goals

Editing geometry, renumbering plots, reclassifying polygons, writing an override file, or
marking anything verified. Geometry is AutoCAD's job (D-118) — fix the DXF, re-run
`make ingest`, reload this page. Verification is the app's job (D-025).
