# D-203: Per-colony click-to-focus zoom is authored by the owner in AutoCAD, not derived

**Status:** accepted
**Date:** 2026-08-29
**Context:** docs/plans/20.md — owner reported that clicking a plot flies to a visibly
different zoom level in different colonies. Root cause: `tools/pipeline` normalises every
colony's SVG to a fixed viewBox width of 1000 units regardless of the colony's real
physical footprint (D-110), so `apps/map`'s single fixed `SELECT_ZOOM` constant produced
wildly different real-world framing per colony (confirmed: ~28.1 screen-px/real-ft on Shree
Vatika 2 vs. ~4.8 on Jai Dev Residency at the same code constant, from each colony's own
`scale.px_per_ft`).

## Decision

The fix is a new optional `COL-ZOOM-REF` DXF layer (0 or 1 entity — a plain closed
`LWPOLYLINE`, or a block `INSERT` scaled/placed per colony): the owner draws a rectangle
sized to whatever real-world area should fill the screen when a plot in that colony is
selected. The pipeline only measures it (`pipeline/export/normalise.py::ring_extent_px`)
into `colony.json`'s optional `select_zoom.{ref_width_px,ref_height_px}`, in SVG-viewBox
units. `apps/map` fits the viewport to that rectangle (`view.ts::selectZoomFor`/
`computeSelectZoom`) instead of using the fixed `SELECT_ZOOM` constant, for any colony that
has one. A colony with no `COL-ZOOM-REF` rectangle keeps today's exact fixed-zoom behaviour,
unchanged.

Explicitly **not** chosen: deriving the reference automatically from `scale.px_per_ft`
(site-wide scale) or from plot size (e.g. median `area_sqft`).

## Why

**Site scale and "how much should fill the screen" are different judgements, and only one
of them is a fact the pipeline can measure.** A colony can have a huge site but small
individual plots (many small plots on a big property), or a small site with a few large
plots — `px_per_ft` alone conflates the two. The owner explicitly rejected an
automatically-derived reference on exactly this ground mid-conversation. What actually
determines "how zoomed in should this feel" is a framing preference — how many neighbouring
plots should be visible, whether the surrounding garden/road context matters for this
specific colony — which is not recoverable from geometry alone.

**This mirrors the project's own established pattern (D-118).** `COL-NORTH`'s line and
`COL-SITE`'s boundary are both "geometry drawn in AutoCAD encodes a fact/judgement; the
pipeline only transforms or measures it, never guesses." `COL-ZOOM-REF` is the same shape:
a judgement (how much of the real world should be visible on selection) expressed as
geometry the owner places once, mechanically measured thereafter. This keeps the pipeline's
core invariant intact — "the reader is strict... never repairs, never guesses" (tier-1.md)
— rather than introducing the first computed-and-therefore-negotiable heuristic in an
otherwise measurement-only pipeline.

**Making it a rectangle (not a single number) also lets it double as a real editing aid.**
The owner can visually compare the rectangle against the drawing before ever running an
export — "does this look like about five plots wide" — which a bare `zoom_ref_ft: 42`
config number would not offer. The 9:16 (phone-portrait) reusable-block workflow the owner
settled on mid-build (`INSERT` + scale a template rectangle per colony, rather than redraw
one from scratch each time) is exactly this: a physically comparable object, not an abstract
parameter.

## Rejected alternatives

- **Derive the reference from `scale.px_per_ft` (site-wide scale), calibrated to reproduce
  the already-approved framing on the most-reviewed fixture (Shree Vatika 2).** Seriously
  considered and partially designed (a `computeSelectZoom`-shaped formula was sketched
  before the owner's explicit rejection) — this is the alternative that was actually on the
  table, not a strawman. Rejected because it silently produces different real-world framing
  for two colonies with the same site scale but very different individual plot sizes, which
  is exactly the inconsistency the owner was trying to eliminate, just relocated rather than
  fixed.
- **Derive the reference from median (or a percentile of) plot `area_sqft`.** Rejected for
  the same reason as above, one level down — plot-size-based derivation still has no way to
  account for "I want the neighbourhood context visible too," which is a framing choice, not
  a geometric fact about any one plot.
- **A single number in the colony config (`select_zoom_ref_width_ft`) instead of drawn
  geometry.** Rejected: still requires the owner to guess a number with no visual feedback
  before ever seeing the result, and breaks the project's established pattern of putting
  measurable facts in AutoCAD and only mechanical config (block/number formatting) in JSON
  (docs/cad-layer-standard.md's `blocks`/`number_width`/`number_range` are all about
  formatting an already-drawn number, never a magnitude nobody has drawn yet).

## Consequences

- `SELECT_ZOOM` (the old fixed constant, `view.ts`) is **not removed** — it is the
  permanent fallback for any colony without a `COL-ZOOM-REF` rectangle, by design, not a
  transitional shim to delete later.
- Every colony onboarded before this change (Shree Vatika 2, Jai Dev Residency) keeps its
  current (inconsistent) click-to-focus framing until someone deliberately draws
  `COL-ZOOM-REF` on that colony's DXF and re-exports/re-uploads it — this is not automatic
  and was never intended to be.
- The computed zoom must be clamped to `[minZoom, maxZoom]` **before** it is used in
  `map.project`/`map.unproject` (which apply an unclamped zoom), not only in the final
  `map.setView` call (which clamps) — otherwise the pan-offset math and the actually
  rendered zoom disagree and `SELECT_VERTICAL_ANCHOR` positioning silently drifts. This was
  never a concern for the old fixed `SELECT_ZOOM`, which was tuned to always sit safely
  under `maxZoom`; a computed, owner-chosen reference has no such guarantee, so every caller
  of this zoom (currently only `useFlyToSelectedPlot.ts`) must clamp before using it, not
  after.
- A colony whose owner-drawn reference implies a zoom above `maxZoom` (very large individual
  plots relative to a small reference rectangle) will be clamped and land somewhat less
  zoomed-in than the rectangle implies — accepted behaviour, not a bug to chase; `maxZoom`
  itself is explicitly out of scope for this decision (owner: "i have no issues with max
  zoom").
