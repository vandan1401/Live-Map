# D-045: A flight skips ground/road/roadEdge textures, restoring them on the settled frame

**Status:** accepted
**Date:** 2026-09-12

## Decision

While a scripted camera flight (`canvasFlyTo.ts::runFlyTo`/`runOpenZoom`) is in progress
(`ColonyCanvasLayer._flyToActive`), `colonyCanvasLayer.ts::_render()` passes `null` for
`grass`/`road`/`roadEdge` into `drawColony()` instead of their real `CanvasPattern`s —
`drawColony.ts` already falls back to flat `theme.groundBase`/`theme.road`/`theme.roadEdge`
colours for a `null` pattern (the same fallback `setGrassImage`'s slow-network first paint
already relies on), so no new drawing code was needed. The flight's own `onComplete`
(`canvasFlyTo.ts`) now calls `host.render()` once more immediately after clearing
`_flyToActive`, so the settled, motionless frame gets the real textures back — without that
extra render, the flight's own last `onFrame` (at `t === 1`) would leave the final view
textureless forever, since `_flyToActive` is still `true` for that last frame.

Backdrop (`drawMapBackdrop`, one `drawImage` call, not a repeating pattern) is untouched —
not implicated, see Why.

## Why

Owner-reported, 2026-09-12: click-to-focus zoom "does not feel as smooth as before" once its
duration was made variable (see `PROGRESS.md`'s same-day log entry) — then, once duration
pacing was ruled out and re-tested, precisely: "i can see the problem the zooming causes the
jitter panning is smooth."

`drawColony.ts` draws everything inside one `ctx.translate/scale(k,k)/translate` block, where
`k` is the current Leaflet zoom scale. A flat colour fill or an already-built `Path2D` costs
the same to rasterize at any `k` — the canvas backend just transforms the same geometry. A
`CanvasPattern` (`canvasPatterns.ts`'s tiled grass/road/road-edge images) is different: filling
a large area with a tiled pattern under a *changing* scale forces the canvas backend to
resample the pattern tile at a new effective pixel size on every single frame, which is real,
measurable cost a plain scaled fill or a translated blit doesn't pay. During a pure pan, `k`
never changes — only the translate does — so the same rasterized pattern is reused frame to
frame (or is at least far cheaper to redraw), which is exactly why panning was already smooth
and zooming wasn't. This is also consistent with `colonyCanvasLayer.ts`'s own long-standing
header comment recording "60fps on animated zoom and pan, 40fps on discrete zoom steps" for
*native* Leaflet zoom gestures — the zoom-specific cost already existed and was already known,
just never singled out or fixed, because no *scripted* flight had ever run long enough (this
engine's duration was a fixed 400ms before this session) for it to be visible.

Skipping the pattern fills only during a flight is a narrow, targeted trade: the texture
detail is genuinely hard to perceive while the camera itself is moving fast, and the flight is
always followed by exactly one more settle render that restores it. This is the same "cheap
now, upgrade once idle" shape as the existing `setGrassImage` slow-network fallback, not a new
pattern invented for this fix.

## Rejected alternatives

- **Pre-rasterizing the pattern at every zoom level a flight might pass through.** Zoom is
  continuous during a flight (eased, not stepped), so there is no fixed set of levels to
  precompute for — this would mean caching a bitmap per frame anyway, which is the exact cost
  being avoided.
- **Also nulling `backdrop` during a flight.** `drawMapBackdrop` does one `drawImage`, not a
  repeating tiled pattern across the whole visible area — a fundamentally cheaper per-frame
  operation, and not implicated by the owner's report (only `bharatkshetra` has a backdrop at
  all; the jitter was reported and reproduced against a colony without one). Left alone rather
  than guessed at.
- **Fixing the same cost for native pinch/scroll zoom, not just scripted flights.** Out of
  scope for this fix — that asymmetry (40fps vs. 60fps) is already known and already
  documented in this layer's own header comment as an accepted characteristic, not something
  this session was asked to change.
