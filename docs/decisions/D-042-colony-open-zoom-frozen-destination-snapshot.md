# D-042: Colony-open zoom-in animates a frozen snapshot of the DESTINATION frame, not the real camera every frame

**Status:** accepted — supersedes D-041's "interpolates the real camera" for the colony-open
zoom specifically. D-041's second decision (a flight's `zoomend` must be guarded out of a
caller's own state recompute, not just the layer's redraw scheduling) is untouched and still
governs both flight types. D-035 (click-to-focus, 400ms) is untouched — this decision applies
to the colony-open zoom only.
**Date:** 2026-09-12

## Decision

`ColonyCanvasLayer.openZoomTo` (called once `MapLoadingScreen.tsx`'s splash says to start)
now renders the DESTINATION view's frame exactly once, into an overlay `<canvas>`
(`canvasOpenZoomSnapshot.ts::runOpenZoomSnapshot`, replacing `canvasFlyTo.ts::runOpenZoom`,
deleted), and animates a plain CSS `transform: scale()` on that overlay from the start view's
scale up to exactly 1 — no `drawColony()` call anywhere in the per-frame loop. The live
canvas underneath is left untouched for the whole flight (still showing its last real render,
the parked start view — correct and unchanging, not stale in the sense of being wrong) and
gets exactly one more real render at the very end, synchronously, once the overlay already
matches it pixel-for-pixel, before the overlay is removed. `map.getContainer().style
.pointerEvents = "none"` for the flight's duration blocks interaction (the live canvas
doesn't reflect what's currently on screen during the flight, so a click/drag/wheel-zoom
reaching Leaflet would act on the wrong picture), restored from the single `cleanup()` every
exit path (normal completion, cancellation, no-2d-context fallback) already goes through.

`canvasFlyTo.ts`'s `runFlyTo` (click-to-focus, D-035) is unchanged — it still interpolates
the real camera and redraws every frame. This decision does not touch it.

## Why

D-041 fixed a real bug (a CSS transform on the Leaflet container structurally can't show
real content outside wherever the shrunk box currently is) by switching the colony-open zoom
onto D-035's real-camera-every-frame engine. That was correct, and a later session (2026-09-11,
same day) found and fixed the `zoomend`-recompute cost it exposed. But the owner reported the
zoom was still not as smooth as it could be, and asked directly for the "static image"
technique to be tried again, explicit that it had caused three bugs previously and asking for
it to be planned correctly this time.

Re-reading D-035's own history: the three prior bugs, and the CSS-transform bug D-041 fixed,
were about two *different* things than what's being proposed now:

1. **D-035's three bugs** were about hooking Leaflet's own `zoomanim`/`_onZoomTransitionEnd`
   pipeline (a real Leaflet-internal lifecycle bug), then about a CSS-transform rewrite that
   got `getZoomScale`'s argument order backwards (inverted scale) and then lost the
   `leaflet-zoom-animated` class's `transform-origin: 0 0` (defaulted to center) — three
   process bugs in a *general-purpose, arbitrary-pan* transform, all incidental to freezing a
   picture, not inherent to it.
2. **D-035's real inherent limit**, independent of those three bugs: blowing up the *start*
   frame's raster by the ~20x a click-to-focus zoom often needs is fundamentally blurry —
   upsampling past native resolution.
3. **D-041's CSS-transform bug** was the container itself being transformed with no separate
   real layer behind it, so the area outside the shrunk box had nothing real to show.

The colony-open zoom differs from click-to-focus in three load-bearing ways that make a
frozen-destination-snapshot technique avoid all four of the above by construction, not by
carefulness alone:

- **It never pans** — `useColonyOpenZoom.ts` always passes the same centre it started at
  (`useColonyCanvas.ts`'s mount effect only changes zoom via `setView`, never the centre).
  A pure scale with a hardcoded `transform-origin: center center` has no second axis for a
  sign or origin to be wrong about — bug 1's failure shape cannot occur.
- **The overlay is painted at the DESTINATION's own native resolution**, not the start's, and
  only ever scaled *down* toward the start then back *up* to exactly 1 — never upscaled past
  native. Bug 2 was specifically about scaling the *start* frame up; this technique never
  does that in either direction.
- **The live canvas is a separate, always-present real layer behind the overlay**, never
  itself transformed — D-041's bug (nothing real behind the shrunk box) cannot recur because
  there is always something real behind it: the live canvas's own last real render.
- **It starts from behind an opaque loading splash**, not mid-interaction — D-035's third
  reason for never freezing a picture (a live redraw is what makes click-to-focus's already-
  interactive canvas keep being genuinely clickable throughout) does not apply here; nothing
  is expected to be interactive during this reveal, which is exactly why the pointer-events
  block above is safe to add and does not change any existing interaction contract.

The actual cost being fixed: `drawColony()` redraws the whole scene — every plot, label,
texture — and its cost grows as the zoom climbs, which is worst exactly in the back third of
the flight where the eased curve (`mapOpenZoomTiming.ts`) already spends the most real time.
A real per-frame redraw over 4.5s (~270 frames) is meaningfully more expensive than the same
redraw over click-to-focus's 400ms (~24 frames), which is why this was invisible until the
duration got long — the same shape of lesson the `zoomend`-recompute cost (D-041) already
taught once this session before it, just in a different place.

## Rejected alternatives

- **Leave D-041's real-camera engine in place and only optimise `drawColony()` itself**
  (e.g. throttling to every 2nd/3rd frame, or culling more aggressively). Would reduce but
  not eliminate the per-frame cost, and a throttled camera reads as visibly stuttery in a way
  a continuous CSS transform does not — rejected because the owner's own ask was specifically
  to stop live-redrawing during this flight, not to make the live redraw cheaper.
- **Freeze the overlay at the START frame's resolution and scale it up** (mirroring D-035's
  original, abandoned technique exactly). Would reintroduce bug 2's blur, and for the same
  reason D-035 rejected it — this flight's zoom ratio (`minZoom` to fit) is not small.
- **A single element carrying both the live content and the animated scale** (transforming
  the canvas itself, as D-041's rejected CSS version did). Rejected for the same reason D-041
  rejected it: nothing real would be left behind the shrunk box.
