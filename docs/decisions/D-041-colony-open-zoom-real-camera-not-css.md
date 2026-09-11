# D-041: Colony-open zoom-in interpolates the real camera, not a CSS transform on the canvas

**Status:** accepted
**Date:** 2026-09-11

## Decision

The colony-open zoom-in (the map visibly zooming from far out to its normal fit view as
`MapLoadingScreen.tsx`'s needle-splash reveals it) reuses D-035's click-to-focus flight
engine (`canvasFlyTo.ts`'s `runFlyTo`/`startCanvasFlyTo`) rather than a CSS `transform:
scale()` on the Leaflet container. `useColonyCanvas.ts`/`usePublicColonyCanvas.ts` park the
map at this colony's own most-zoomed-out view (`map.getMinZoom()` — varies per colony, a
plain colony's is a fixed `-2`, a backdrop colony's is raster-derived) at mount, same centre
the real fit chose, hidden behind the splash; `useColonyOpenZoom.ts` animates it back up to
the normal fit view once the splash says to (`runOpenZoom`, its own duration/easing —
`mapOpenZoomTiming.ts`'s `MAP_OPEN_ZOOM_MS`/`MAP_OPEN_ZOOM_EASE_POINTS`).

A second, related decision made getting here: a flight's own `zoomend` events (a
non-animated `setView` fires the full move/zoom/zoomend sequence synchronously on every
single rAF frame of a flight, not just once at the end) must be guarded out of a caller's
own `zoomend`-driven state recompute, not just the layer's own internal redraw scheduling —
`ColonyCanvasLayer.isFlying()` (backed by the existing `_flyToActive`), checked before
either hook's `onZoom` calls `pushState`.

## Why

This feature originally shipped (2026-09-10) as a CSS `transform: scale()` on
`.colony-map-zoom-in`, the Leaflet container itself — deliberately, at the time, to avoid
touching Leaflet's real zoom/pan state at all ("a CSS transform doesn't touch layout
geometry... it's purely visual"). That went live and broke the next session: the canvas is
sized to the *viewport*, not the colony (D-027), so it already fills the
whole screen with real content at rest; visually shrinking that already-full canvas via a
CSS transform just moves where its edges land on screen — the area beyond wherever the
shrunk box currently was showed nothing real underneath it. The owner reported this
directly: "the area which would be visible in final frame is rendered only and nothing else
— the outer area needs to be rendered also." A flat-colour fix, then a matching-texture
fix, both papered over the *symptom* without addressing that the transform was fundamentally
faking a zoom rather than performing one.

Once the owner proposed the real fix directly — "the first frame should start from the
maximum possible zoom out of a map, and it zooms in slowly to the desired amount" — the
answer was already sitting in this codebase: D-035 solved the exact same problem
(faking a zoom via a CSS transform / frozen snapshot vs. actually driving the camera) for
click-to-focus-a-plot, the hard way, across three failed attempts. Reusing that proven
engine for a second, much longer-duration use (4.5s vs. click-to-focus's 400ms) was far
cheaper than re-deriving the same lesson from scratch, and it structurally can't have the
"area beyond the box" problem at all — the canvas is always rendering real content at
whatever zoom Leaflet is actually at, filling the viewport, at every single frame.

The longer duration did surface a real, previously-invisible cost the 400ms case never
had time to make visible: `useColonyCanvas.ts`'s own `zoomend` listener called a full
`pushState()` — status-visibility, the corner-plot set, the label-detail threshold, a real
recompute, not a no-op — on every single animation frame, on top of the redraw the flight
already triggers directly. At 400ms (~24 frames) that waste was there but unnoticeable; at
4.5s it was the owner's next report ("the fps is very low now"). The fix is general, not
specific to this feature — any future caller of either flight has the same exposure — hence
`isFlying()` living on the layer itself rather than as a one-off guard in this feature's own
code.

## Rejected alternatives

- **A CSS transform on the Leaflet container (the original 2026-09-10 shape).** Shipped,
  broke production (see Why) — structurally can't show real content outside whatever box the
  transform currently occupies, no matter how that box's surroundings are patched.
- **Patching the CSS version's exposed area with a matching texture, rather than replacing
  the mechanism.** Tried in the same session as an intermediate step (a flat colour, then a
  seamless mirrored-tile CSS background matching `canvasPatterns.ts`'s own texture) — fixed
  the visible seam but not the owner's core complaint (the outer tile scale didn't match the
  zoomed content, because it fundamentally isn't the same rendering), and added real
  complexity (a new module, a `main.tsx` hook, two CSS custom properties) for a problem the
  real-camera approach eliminates by construction. Fully reverted once the real fix landed.
- **Leaving the `zoomend`-during-flight cost alone and just shortening `MAP_OPEN_ZOOM_MS`.**
  Would have masked the symptom at the cost of the deliberately-tuned slow-settle feel
  (see the easing curve's own history in `mapOpenZoomTiming.ts`) rather than fixing the
  actual waste; the guard fixes it for any future duration, not just this one.
