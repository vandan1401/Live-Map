# D-044: Remove the colony-open map-side zoom entirely

**Status:** accepted
**Date:** 2026-09-12

## Decision

The colony-open map "zoom-in" feature is removed completely, not replaced with a fourth
mechanism. `useColonyCanvas.ts`/`usePublicColonyCanvas.ts` no longer park the map at
`minZoom` after `fitBounds` — the map renders its real, final view from the very first
frame and never moves on its own. `useColonyOpenZoom.ts` and `nativeOpenZoom.ts` are
deleted; `ColonyCanvasLayer.openZoomTo` is deleted; the `zoomingIn`/`mapZooming` plumbing
threading a "start now" signal from `MapLoadingScreen.tsx` through `useColonyOpenSplash.ts`,
`App.tsx`, `PublicColonyView.tsx`, `ColonyMap.tsx`, and both canvas hooks is deleted end to
end, including `MapLoadingScreen`'s own `onZoomStart` prop.

`MapLoadingScreen.tsx`'s own splash animation (the needle-shaped hole widening as its own
`.map-loading-scene` scales up, per its own header comment) is **unchanged** — it still runs
on `MAP_OPEN_HOLD_MS`/`MAP_OPEN_ZOOM_MS`, still fades out, still reveals whatever is
underneath. What it reveals is now simply the map's own already-correct, motionless final
state — the splash is the only thing animating.

## Why

Three same-day attempts at a matching map-side zoom (D-041's real-camera-every-frame engine,
D-042's frozen-destination-snapshot overlay, D-043's native-Leaflet animated zoom) each
either had a real performance cost, a real device-only bug, or an unverified easing
approximation — and this session has no way to watch any of `requestAnimationFrame`-driven
or CSS-transition-driven motion execute at all (a backgrounded browser-automation tab
suspends both), so every attempt's actual feel could only ever be verified by the owner,
one round-trip at a time. After the third attempt, the owner's own words: "i dont think this
is correct time to impliment zoom in after splash... i had to accept you cant do this." That
is the actual, sufficient reason — not a technical dead end, a decision that the payoff
(the map visibly growing in as the splash reveals it) is not worth a fourth attempt at a
mechanism this session cannot verify before shipping it. The splash's own reveal — which
this session never touched and which has had zero reported bugs across every prior
session — still gives the "opening a colony" moment its own motion; the map underneath
simply no longer tries to add a second, independently-timed one on top of it.

## Rejected alternatives

- **A fourth zoom mechanism**, or hand-tuning D-043's `easeLinearity`/re-adding a fallback
  for whatever might make it feel wrong. Not attempted — the owner's direction was to stop,
  not to keep iterating on this specific feature.
- **Keeping the map-side zoom code in place but disabled** (e.g. behind a flag), in case a
  future session wants to revisit it. Rejected: dead, unreachable code that threads a
  "zoomingIn" boolean through six files for a feature nobody calls is exactly the kind of
  half-finished implementation this repo's own conventions ask not to leave behind — deleted
  completely instead. D-041/D-042/D-043's own decision docs and this file are the record a
  future session should read before trying this again, not a commented-out code path.
