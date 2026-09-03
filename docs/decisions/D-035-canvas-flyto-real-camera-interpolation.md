# D-035: Click-to-focus zoom interpolates the real camera, never animates a frozen snapshot

**Status:** accepted
**Date:** 2026-09-04

## Decision

The click-to-focus zoom transition (owner clicks a plot; the map pans and zooms to frame
it) interpolates the actual map camera — center in projected pixel space, zoom level
linearly, both eased through the same cubic-bezier curve — across the transition's
duration, calling `map.setView(..., {animate: false})` plus the canvas layer's own
`_resize()`/`_render()` on every animation frame. Every frame is a real, crisp vector
redraw of the colony through the same `drawColony()` path already used for ordinary
Leaflet-driven pan/zoom.

It never freezes a raster snapshot of the canvas and animates a CSS `transform` on that
snapshot to approximate the new view.

## Why

Three earlier attempts, in order, each tried to make Leaflet's own animated-zoom machinery
(or a hand-rolled equivalent) drive a static picture, and each failed for a different
reason:

1. **Hooking Leaflet's built-in animated `setView`.** Leaflet's `_tryAnimatedZoom` needs
   `_nothingToAnimate()` to find an element with the `leaflet-zoom-animated` class, and its
   completion is scheduled via `Map._animateZoom`'s bare, uncancellable `setTimeout`. Once
   the class was added and the animation genuinely engaged, tearing down/recreating the map
   (or another zoom racing it) while that timeout was still pending threw a real exception
   deep inside Leaflet (`Cannot read properties of undefined (reading '_leaflet_pos')`,
   confirmed live in the browser console), permanently freezing the canvas mid-transform
   because the `'zoom'`/`'zoomend'` events the redraw depends on never fired.
2. **A self-driven CSS transition on a frozen bitmap.** Moving the map instantly and
   animating `transform: translate3d(...) scale(...)` on a snapshot of the old view avoided
   Leaflet's internal timer entirely, but needed exact, error-prone geometry: `getZoomScale`
   argument order (target-first vs. from-first inverts the scale), animation direction
   (start at the current appearance vs. start at the computed target), and the canvas's
   `transform-origin` (silently defaults to center, but the scale math assumes the top-left
   corner — lost when the `leaflet-zoom-animated` class was dropped in the same rewrite that
   moved away from technique 1, since that class happens to also carry Leaflet's own
   `transform-origin: 0 0` rule). Three of these were each individually real bugs, found and
   fixed one at a time, and each looked plausible in isolation.
3. Even with every one of those bugs fixed, blowing up a raster snapshot by the ~20x a
   click-to-focus zoom often needs is inherently blurry — a limitation of the technique
   itself, not a bug any fix could remove.

Interpolating the real camera and redrawing crisply every frame sidesteps every one of
these: no dependency on Leaflet's internal animation timer, no CSS-transform geometry to
get exactly right, and no raster scale-up since the content is vector-drawn fresh at every
intermediate zoom. It is also not new engineering — the same canvas already redraws on
every real user-driven pan/zoom event at a measured 60fps (`colonyCanvasLayer.ts`'s own
header comment); this decision just drives that same proven path programmatically instead
of building a second, illusion-based one alongside it.

## Rejected alternatives

- **Leaflet's built-in animated `setView` + `zoomanim`.** Rejected after hitting the
  uncancellable-timeout lifecycle bug described above — not something this app's code can
  fix without patching Leaflet itself.
- **CSS transform on a frozen raster snapshot (fully bug-fixed).** Rejected even once
  correct, because the ~20x scale-up is inherently blurry for the zoom factors this app's
  colonies actually need; no further debugging could have fixed that.
- **A fixed, colony-independent animation duration/curve with no interpolation at all
  (i.e., leave the original instant snap).** Not seriously considered — the whole point of
  this thread of work was the owner's explicit ask for a smooth transition.
