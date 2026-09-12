# D-043: Colony-open zoom-in drives Leaflet's own native animated zoom

**Status:** accepted
**Date:** 2026-09-12

## Decision

`ColonyCanvasLayer.openZoomTo` (`nativeOpenZoom.ts`) calls Leaflet's own
`map.setView(center, zoom, { animate: true, duration, easeLinearity })` — the same
CSS-pane-transition-plus-one-real-redraw mechanism an ordinary scroll-wheel or double-click
zoom already uses on this map. The canvas element gains the `leaflet-zoom-animated` class
(`colonyCanvasLayer.ts`'s `onAdd()`) so Leaflet's own animated-zoom pipeline engages at
all — without an element carrying that class anywhere, Leaflet's `_nothingToAnimate()` bails
and every zoom, requested as animated or not, is an instant snap. Pointer-events are dropped
on the map container for the flight's duration (the live canvas doesn't reflect Leaflet's
own in-flight pane transform the way a real redraw would, so a click reaching it mid-flight
would act on stale content) and restored on `'zoomend'`, with a timeout backup in case that
event never fires. `colonyCanvasLayer.ts::onRemove` calls the public `map.stop()` before
tearing the layer down, since a pending native zoom completes via a Leaflet-internal timer
this layer does not own.

This replaces BOTH of this session's earlier attempts for the same feature:
- D-041's real-camera-every-frame engine (`canvasFlyTo.ts::runOpenZoom`, deleted) — correct,
  but a real `drawColony()` on every one of ~270 frames over 4.5s.
- D-042's frozen-destination-snapshot CSS overlay (`canvasOpenZoomSnapshot.ts`,
  `renderCanvasFrame.ts`, deleted) — avoided that redraw cost, but its overlay's
  `getContext("2d")` returned null on the owner's real test device (a detached-canvas
  WebKit quirk), which took a silent, unanimated instant-cut fallback path. A fix for that
  specific bug was written and deployed; the owner asked to stop iterating on it regardless.

## Why

The owner's own framing, after D-042's bug: "we do have a zoom animation on the map with all
the functionality and it is live also... use the exact same map animation which we are using
in live map, just trigger zoom in live map as if user is zooming it" — and, after a first
answer restored D-041's real-camera engine, corrected further: "the real camera does not
mean the previous version which had very low fps i want how our map is zoomin[g]... trigger[ed]
while opening." Read together, this asks for neither of this session's two custom engines —
it asks for **whatever mechanism makes an ordinary user-driven zoom on this map feel the way
it does today**, triggered programmatically instead of by a real gesture.

That mechanism is Leaflet's own native animated zoom, not either custom flight engine either
prior attempt reused or invented. It was not in use for this feature before today because
D-035's own click-to-focus history (see `canvasFlyTo.ts`'s header) hit a real Leaflet-internal
crash trying to hook it — but that crash was specifically in a *custom* `zoomanim` handler
mirroring `Renderer._onAnimZoom`, added on top of Leaflet's own pipeline to get a fully custom
400ms duration and 4-point bezier easing. It engaged Leaflet's animated-zoom pipeline first
(confirmed working) — the custom `_onZoomTransitionEnd`-adjacent handling on top of it is
what broke on teardown/a racing zoom. This decision adds no such custom handler: it calls
`setView({animate:true, duration, easeLinearity})` and lets Leaflet run its own, unmodified,
already-battle-tested completion path — `_schedule()` is already wired to `'zoomend'` and
needs no changes to redraw correctly once, at the true end, exactly as it does for a real
zoom today. The residual risk that history warns about — the map or layer being torn down,
or another zoom racing this one, while Leaflet's own completion timer is still pending — is
mitigated the same way Leaflet itself recommends: `map.stop()` before removal. It is not
airtight against every theoretical race (a plot selected via search, which stays interactive
during this flight since it lives outside the pointer-events-blocked container, could in
principle race Leaflet's own zoom internals) but that requires the user to already know a
specific plot exists before ever having seen the map — see Deferred in PROGRESS.md.

The honest tradeoff: Leaflet's `easeLinearity` is a single 0-1 knob, not the 4-point bezier
`MAP_OPEN_ZOOM_EASE_POINTS` was tuned to (`mapOpenZoomTiming.ts`'s own history of that
tuning). `MAP_OPEN_ZOOM_EASE_LINEARITY` is a fresh, unverified approximation — this session
cannot watch a CSS-transition-driven or `requestAnimationFrame`-driven animation execute at
all (a backgrounded automation tab suspends both), so the exact feel needs the owner's own
eyes on a real device, the same as every prior easing tune in this file's history.

## Rejected alternatives

- **D-041's real-camera-every-frame engine, kept as-is.** Explicitly rejected by the owner —
  "does not mean the previous version which had very low fps."
- **D-042's frozen-snapshot CSS overlay, patched for the detached-canvas bug and reshipped.**
  Technically addressed the confirmed root cause, but the owner asked to stop iterating on a
  technique that had already produced two real, device-only bugs in one session — a
  legitimate call independent of whether that particular fix would have held.
- **A custom `zoomanim` handler alongside the native pipeline**, to keep the exact tuned
  bezier curve. Rejected: this is precisely the addition that broke click-to-focus's own
  attempt at this before (D-035's history) — the whole point of this decision is to run
  Leaflet's pipeline unmodified, not to re-attempt the piece that crashed last time.
