---
name: review-prototype-envelope-mismatch
description: Coordinates/thresholds copied verbatim from an experiments/ prototype land outside the shipped app's reachable viewport — compute the real view rectangle and check every pinned number falls inside it
metadata:
  type: feedback
---

When a plan pins constants "reused verbatim, do not re-derive" from a prototype in
`experiments/`, compute the **shipped app's reachable view rectangle** yourself and check
every pinned coordinate falls inside it. The prototype's camera is almost never the app's
camera.

**Why:** 2026-09-08, plan 28 (Bharatkshetra backdrop). The prototype
(`zoom_labels_demo.html`) framed the whole 1440x960 raster — ~6.3 km across. The shipped
app's public link does `fitBounds(colonyLatLngBounds(1000, 1399.73))` with `minZoom: -2`,
so its reachable view is roughly the colony's own ~300 m box. Consequences, all invisible
to typecheck/lint/tests (all green) and all arithmetic, not opinion:

- All 9 label world coordinates sit 1.3x–10x the colony extent away. With the map centred
  on the colony, **0 of 9 labels can be on screen at any zoom >= minZoom on a 390x700
  viewport; 1 of 9 on 1200x800.**
- The reveal predicate `zoom >= fitZoom + offset` (`mapBackdropLabels.ts`) is *inverted*:
  positive offsets reveal a label by zooming **in**, but the labels only enter the frame by
  zooming **out**. The two windows are disjoint by construction.
- The vignette faded out on zoom-**in** from `fitZoom`, so it was fully opaque at the
  default view — blurring the live colony's own outer plots, the opposite of the intent.
- At fit, only ~70 (phone) to ~148 (desktop) of the raster's 1440 px span the viewport: the
  shipped 1440x960 JPEG is seen as a ~70x98-pixel crop upscaled to full screen.

**2nd pass, same plan, after the fit was padded (`BACKDROP_FIT_PADDING = 4.5`,
`BACKDROP_MIN_ZOOM = -8`): the labels became reachable, and reaching them now exposes the
raster's own edge.** The next thing to compute after "can the user get there" is "what else
is on screen when they do". Raster world extent = `imageWidth / transform.scale` =
1440/0.0703125 = **20,480 x 13,653** world units, origin at `backdropPixelToWorld(t,0,0)` =
(-10604, -4448). The outermost pinned label (`Bibdod Road`, worldX 9694.20) sits **181 world
units — 39 raster px — from the raster's right edge**, because the prototype placed its
labels across the *whole* frame it always displayed in full. On a 390x700 viewport, centring
that label needs 47.1 world units/px, so the visible height is 32,970 — 2.4x the raster's
13,653; panning to it at the default zoom puts the right edge in frame instead. `drawColony`
fills the whole visible world rect with grass and paints the raster as a plain rectangle on
top, so either route shows a hard photo edge on bare tiled grass. **Prototypes frame their
raster; apps don't. After checking a pinned point is reachable, check the raster's own
extent against the viewport at that zoom.**

**3rd pass, same plan, after the minZoom was derived from `backdropWorldBounds`.** The
derivation was right; the Leaflet call was not. `useMapBackdrop.ts::applyBackdropMinZoom`
calls `map.getBoundsZoom(rasterBounds)` — `inside` defaults falsy, so Leaflet takes
`min(scalex, scaley)` and fits the raster **inside** the viewport (letterboxed) rather than
covering it. Raster AABB is 21056 x 14534 (aspect 1.449); a 390x700 portrait phone at the
derived minZoom (-5.75) sees a 21056 x 37793 world rect — **61.5% of the screen is bare
grass** around a hard photo edge, the exact outcome the derivation was written to prevent.
Desktop 1200x800 hides it (3.4%), which is why it reads as fine. `inside: true` is the
one-word fix. Also: `fit()` runs once (`didInitialFit`), so minZoom is never recomputed on
orientation change — the portrait value lets you zoom out further still in landscape.
**Rule: `getBoundsZoom`'s second arg is the whole difference between "fits in view" and
"covers the view"; whenever a bound is derived to prevent seeing past an image's edge, it
is `inside: true`, and check the aspect ratios of both a phone and a desktop viewport.**
Panning is a separate axis and is still unconstrained (no `setMaxBounds` anywhere).

**4th pass, same plan, after `inside: true` and a resize re-derivation were both added.**
The derivation and the flag were now right; the *feedback loop* was not. Leaflet's
`getBoundsZoom` ends with `return Math.max(min, Math.min(max, zoom))` where
`min = this.getMinZoom()` (leaflet-src.js:4001). `applyBackdropMinZoom` feeds its own output
back in via `map.setMinZoom(map.getBoundsZoom(bounds, true))`, so from the second call on the
value can only **ratchet upward** — it latches at the largest viewport ever seen and never
re-lowers. Phone rotate portrait 390x780 (-4.2) → landscape 780x390 (wants -4.7) stays -4.2:
~0.5 zoom units of legitimate zoom-out silently lost, while the plan and PROGRESS.md both
claim "re-derives it on every resize rather than keeping a stale value". Fix: drop minZoom to
the placeholder floor before measuring, then set the measured value.
**Rule: any Leaflet getter that clamps to the map's *current* options (`getBoundsZoom`,
`_limitCenter`, `setZoom`) is not idempotent when its result is written back into those same
options. Read the Leaflet source's last line before trusting a derive-and-set loop.**

**5th pass, same plan, same function, after the ratchet was fixed.** The loop was now
correct; the *geometry it consumes* was not. `backdropWorldBounds` returns the
**circumscribed** axis-aligned box of a raster that `rotateDeg = 2.5` tilts — 21056 x 14534
against a true raster of 20480 x 13653. `applyBackdropMinZoom` feeds that box to both
`getBoundsZoom(bounds, true)` and `setMaxBounds(bounds)`, so "the viewport fits inside the
box" is satisfied while four triangular wedges of the box are outside the photo. Overhang =
`(imageHeight/scale)·sinθ = 595.6` in x, `(imageWidth/scale)·sinθ = 893.3` in y; at the
derived minZoom that is **47.9 px of bare grass along the top and bottom on 390x780, 54.3 px
on 1280x800** — visible with no panning at all, against a comment claiming "the raster covers
the whole screen with no exposed edge". Fix: inscribe, don't circumscribe — inset the box by
those two overhangs before deriving. **Rule: an AABB of a rotated shape is a superset, so it
is the right answer for "where might this be" and the wrong answer for "what does this
cover". Whenever a bbox is used as a coverage guarantee, check the rotation term; the file
that computes it may even say "rotateDeg tilts it" and still be misused one file over.**

**6th pass, same plan, same function — LANDED, verified by hand.** `applyBackdropMinZoom`
now insets by `dx = (imageHeight/scale)·|sinθ|`, `dy = (imageWidth/scale)·|sinθ|` before
`getBoundsZoom(bounds, true)`/`setMaxBounds`. Checked algebraically (with the rect centred,
half-extents `hx = (a·c − b·s)/2`, `hy = (b·c − a·s)/2` satisfy both `hx·c + hy·s ≤ a/2` and
`hx·s + hy·c ≤ b/2`, with slack `cos2θ`) and numerically (inscribed box x[−10009, 9856.8],
y[−4448.7, 8299.4] — its corners land exactly on the tilted raster's edges). All 9 pinned
labels are inside it; the padded fit rect is inside it on phone/desktop/landscape.
Leaflet 1.9.4's `setMaxBounds` does `off` then `on`, so the per-resize call leaks no
listener. **Two residuals worth carrying forward:** (a) `mapBackdropTransform.ts:40-44`'s
comment still credits `backdropWorldBounds` alone with preventing bare grass — the inset
lives one file over, so the next caller of that function reintroduces the bug; (b) nothing
tests the inset (see [[review-vacuous-acceptance-tests]] item 15). Also noted: on a viewport
past ~3.66:1 the derived minZoom exceeds the padded-fit zoom and `setMinZoom` overrides the
fit — real but rare, not flagged.

**7th pass, same plan — geometry CLOSED, re-verified independently. Stop re-litigating it.**
Recomputed from scratch this pass, not read back: (a) all 9 pinned label world coords in
`config/mapBackdrop.json` reproduce exactly from `zoom_labels_demo.html`'s raster-pixel
`left/top` values through `backdropPixelToWorld`; (b) the inscribed box satisfies both
containment inequalities (`hx·c + hy·s = 10201 ≤ 10240`, `hx·s + hy·c = 6800.6 ≤ 6826.7`);
(c) the throw limit is exactly `tan θ ≥ imageHeight/imageWidth` as the comment claims;
(d) `BACKDROP_FIT_PADDING = 4.5` and `VIGNETTE_FADE_RANGE = log2(1.6)` both match the
prototype's own `COLONY_VIEW_PADDING`/`edgeBlurOpacity` verbatim, and `update()` reproduces
`Math.max(0, Math.min(1, 1 - t))` exactly; (e) derived minZoom (−4.19 phone / −3.99 desktop)
sits below the padded-fit zoom (−3.53 / −2.98), so `setMinZoom` never overrides the fit.
Also checked in Leaflet 1.9.4's own source: `maxBoundsViscosity` defaults to `0.0`, so
`_offsetLimit` is `null` and panning is *unconstrained during the drag* — `setMaxBounds`
enforces via its `moveend` → `_panInsideMaxBounds` snap-back instead. Rubber-band excursion
past the raster edge is therefore possible mid-drag; judged Leaflet's documented default,
not a finding.

**How to apply:** the check is one script, not a read-through. Get the model extent, the
`fitBounds` target, `minZoom`/`maxZoom`, then for each pinned point compute
`log2(min(vw/(2|dx|), vh/(2|dy|)))` — the highest zoom at which it is still on screen — and
compare against the zoom range the feature claims to show it in. Do this for a phone and a
desktop viewport. Related: [[review-unpinned-constants]] (constants that drift *within* a
plan), [[review-fixture-geometry-unchecked]] (same instinct: recompute the geometry rather
than trusting the number).
