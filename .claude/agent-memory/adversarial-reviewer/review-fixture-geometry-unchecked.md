---
name: review-fixture-geometry-unchecked
description: Nothing in this repo checks fixture geometry or keeps app constants in sync with the fixture — parse colony.svg yourself and diff it against colony.json and ColonyMap.tsx's VIEW_BOX on any fixture change.
metadata:
  type: feedback
---

`fixtures/shree-vatika-2/` is hand-authored, and the only stated check on its geometry is
"the owner opens it in a browser". Every automated gate (`import-seed.ts`, the schema,
`verify-map`) checks *ids and shapes of records*, never *where the shapes sit*. So on any
diff touching `colony.svg` / `colony.json`, do the geometry check by hand:

1. Parse the `class="plot"` / `class="road"` / `class="site-boundary"` rects out of the SVG
   in a throwaway node script and test pairwise overlap, road overlap, and containment in
   the boundary.
2. Diff the SVG's `viewBox`, the manifest's `colony.viewbox`, and
   `apps/map/src/components/ColonyMap.tsx`'s `VIEW_BOX` constant — three copies of the same
   number, only one of which the schema constrains.
3. Diff `<text class="plot-label">` content against whatever app code matches on it.
4. **Recompute `facing` and `is_corner` from road adjacency** and diff against the manifest.
   For each plot, find which side (N/S/E/W, y-down so road above = north) a `.road` sub-rect
   touches, and compare. tier-2.md stores these at import and never recomputes, so a wrong
   value is permanent and shows in the detail sheet as a fact about a saleable plot
   (`PlotDetailContent.tsx` renders `is_corner` as a "Corner plot" badge — a price claim).
   - 2026-08-14 second pass: overlaps/viewBox/labels all fixed, but plots 55 and 56 claimed
     `facing: "north"` with their only road on the south edge.
   - 2026-08-14 third pass: `facing` all 26 correct, but `is_corner` was `true` for 12 plots
     touching exactly one road. **Root cause both times: the generator assigns derived
     fields positionally ("first/last column of the row") instead of computing them from the
     road geometry it just emitted.** Positional rules break the moment plots are dropped
     from the set — plan 05 excluded ~8 unreadable interior plots, so the "first column" of
     several rows became an interior plot that is now badged as a corner.

   - 2026-08-14 fourth pass: **clean.** 0 plot-plot and 0 plot-road overlaps, all 26 inside
     the boundary, `viewBox` 1000x1390 agreeing with the manifest and read live off the
     parsed SVG in `ColonyMap.tsx` (the `VIEW_BOX` constant is gone), labels carry
     `data-plot="plot-A-NN"` and the hook matches on that, and `facing` / `is_corner` /
     `centroid` / `area_sqft` all recompute exactly. Also worth checking and also correct:
     **length/breadth orientation** — `plotDimensionOverlay.ts` assumes bbox *width* is
     `length_ft` and bbox *height* is `breadth_ft` for every plot, which is a convention no
     schema enforces; a single rotated plot would print swapped numbers on the callout.

**The recurrence is the derived field, not the specific field.** Assume any manifest value
that *could* be computed from the SVG was instead typed or positioned by hand, and compute
it. See also [[review-fixture-plot-count-drift]] for the non-geometric half of this.

**Why:** 2026-08-14 (plan 05) all three failed at once and none of typecheck/lint/52 tests/
schema noticed: 10 plot-plot overlaps + 12 plot-road overlaps + 3 plots outside the site
boundary (rows placed at a road band's top edge instead of its bottom); `VIEW_BOX` left at
`height: 720` after the fixture became 1000 tall; labels emitted as `1`/`3`/`6` while
`useSelectedPlotOverlay.ts` matched on `"A-01"`. Overlapping plots are a tier-1.md identity
bug, not a cosmetic one — `target.closest(".plot")` selects whichever path paints last, so
a tap opens the wrong plot's owner and price.

**How to apply:** ~20 lines of node settles all three in one call. Do it before reading any
prose about what the fixture contains. Related: [[review-attribution-fallbacks]],
[[review-vacuous-acceptance-tests]].
</content>
</invoke>
