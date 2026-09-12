# D-046: A flight's per-frame tick calls Leaflet's internal `_move()`, not the public `setView()`

**Status:** accepted
**Date:** 2026-09-12

## Decision

`canvasFlyTo.ts::startCanvasFlyTo`'s tick loop now calls Leaflet's internal, underscore-
prefixed `map._move(center, zoom)` on every intermediate animation frame instead of the
public `map.setView(center, zoom, { animate: false })`. Exactly one real `setView(..., {
animate: false })` call still happens — on the flight's very last frame (`t === 1`) — to
fully settle the map's internal state once the flight ends. The cast needed to call the
undeclared `_move` method is confined to one line (`LeafletMapInternals`, declared right
above `startCanvasFlyTo`), the same "one unavoidable cast" convention
`colonyCanvasLayer.ts` already uses for its own untyped `L.Layer.extend()` constructor.

## Why

Owner-reported, 2026-09-12, after D-045 (the pattern-texture fix) didn't fully resolve the
jitter: "i can see the problem the zooming causes the jitter panning is smooth" — refined,
once asked to confirm, to: jitter only when pan and zoom change *together*, not when either
happens alone (dragging with a finger, or pinch-zooming with a finger, were both smooth).

Read directly against the installed Leaflet source
(`apps/map/node_modules/leaflet/dist/leaflet-src.js`, v1.9.4, since this app pins an exact
version) rather than assumed from memory:

- `Map.setView()` (`leaflet-src.js:3291`) tries `_tryAnimatedZoom()` whenever the target zoom
  differs from the map's current zoom — true on almost every frame of a flight. With
  `options.animate === false` (which this engine passes deliberately, precisely to avoid
  racing Leaflet's own CSS zoom-animation machinery against this engine's own per-frame
  redraw — see the file's own header comment), `_tryAnimatedZoom` bails out immediately
  (`leaflet-src.js:4779`), and `setView` falls through to `_resetView()`
  (`leaflet-src.js:4287`): resets `_mapPane`'s CSS position to `(0,0)`, recomputes the pixel
  origin, and fires `viewprereset`/`zoomstart`/`movestart`/`zoom`/`move`/`moveend`/
  `viewreset` — real work, done up to 60 times a second for the whole flight.
- Leaflet's own `TouchZoom` handler (`leaflet-src.js:14313`) — what actually runs during a
  live two-finger pinch — never calls the public `setView` while fingers are moving. Its
  `_onTouchMove` (`leaflet-src.js:14351`) calls the internal `map._move(center, zoom, {pinch:
  true, round:false})` directly on every `touchmove`: `_move()` just updates
  `_zoom`/`_pixelOrigin` and fires plain `'zoom'`/`'move'` events — none of `_resetView`'s
  pane-reset or event cascade. Only once, at `_onTouchEnd` (finger lift), does it call the
  heavier `_animateZoom`/`_resetView` path — exactly once per gesture, not per frame. The
  `Drag` handler (native panning) similarly never routes through `setView` during a live
  drag.

This is the actual mechanism behind the owner's own observation: it was never really "zoom
is expensive" — it's that *this engine's* per-frame `setView(..., {animate:false})` call
was the only code path in the whole app hitting the expensive `_resetView` branch on every
single frame, because it's the only thing repeatedly calling the *public* API with zoom
explicitly non-animated. Matching Leaflet's own established technique (`_move()` for every
live frame, one real settle at the end) removes exactly that cost, using the same method
Leaflet's own gesture handlers already depend on for smoothness.

The canvas layer's own DOM positioning (`colonyCanvasLayer.ts::_render()`'s
`L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))`) does not depend on
`_resetView` having run — `containerPointToLayerPoint` reads `_mapPane`'s live CSS position
each call, and the canvas is drawn from `view` (derived straight from `map.getCenter()`/
`map.getZoom()`, not from `_pixelOrigin`) — so per-frame `_move()` calls, which do update
`_zoom`/`_pixelOrigin`/fire `'move'`/`'zoom'`, keep this layer's own redraw fully correct
without the heavier reset.

## Rejected alternatives

- **Calling plain `setView(center, zoom)` with no `animate` option**, letting
  `_tryAnimatedZoom` succeed. Rejected: for tiny per-frame zoom deltas this would trigger
  Leaflet's own CSS-transition zoom animation (`_animateZoom`) on top of this engine's own
  manual redraw — the exact race this engine's header comment already documents avoiding by
  passing `animate: false` in the first place.
- **Calling `_move()` for every frame including the last, with no final `setView`.**
  Rejected: `_move()` alone never resyncs `_mapPane`'s CSS position or fires
  `zoomend`/`moveend`, which the (currently unhidden, default) Leaflet zoom control and any
  future consumer of those events depend on. Mirroring `TouchZoom`'s own one-settle-at-the-
  end shape costs nothing extra (one `setView` call, once) and keeps the map's own internal
  state fully consistent with what every native gesture already leaves behind.
