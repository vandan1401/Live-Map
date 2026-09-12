import L from "leaflet";
import { MAP_OPEN_ZOOM_MS, MAP_OPEN_ZOOM_EASE_POINTS } from "../../lib/colony/mapOpenZoomTiming.ts";

const FLY_TO_MIN_DURATION_MS = 400; // owner ask, 2026-09-04 — click-to-focus-a-plot's own pace
const FLY_TO_MAX_DURATION_MS = 2000; // owner ask, 2026-09-12 — a big zoom/pan jump gets more time
const FLY_TO_EASE_POINTS: [number, number, number, number] = [0, 0, 0.4, 1]; // owner ask, 2026-09-04

// Screens of pan (owner ask, 2026-09-12: 400ms felt too fast for a long jump) needed to
// reach the max duration. Deliberately NOT a function of zoom-level delta too, despite an
// earlier version being one (see git history) -- the everyday "tap a plot from the fit view"
// case always involves a big zoom swing (fit zoom to SELECT_ZOOM, often 4+ levels) with only
// a small on-screen pan, and including zoom delta made that everyday case sit near the
// ceiling instead of near the floor: 5x longer on screen than before was enough for ordinary
// frame-time variance to read as visible stutter (owner-reported, same day), something a
// 400ms flight was too brief to expose. Pan distance alone is also just a more direct read
// of what "near plot vs. far plot" (the ask) actually means.
const FLY_TO_MAX_EFFORT_SCREENS = 3;

function flyToDurationMs(map: L.Map, fromCenter: L.LatLng, fromZoom: number, toCenter: L.LatLng): number {
  const panPx = map.project(fromCenter, fromZoom).distanceTo(map.project(toCenter, fromZoom));
  const panScreens = panPx / Math.max(map.getSize().x, map.getSize().y);
  const effort = Math.min(1, panScreens / FLY_TO_MAX_EFFORT_SCREENS);
  return FLY_TO_MIN_DURATION_MS + effort * (FLY_TO_MAX_DURATION_MS - FLY_TO_MIN_DURATION_MS);
}

// Rebuilt from scratch (2026-09-04) after three attempts at animating a CSS transform on a
// frozen raster snapshot of the old view all failed for different reasons (a real Leaflet
// lifecycle bug in the zoomanim pipeline, an inverted scale, a backwards direction, and
// finally a missing transform-origin that undid all of the above) -- see git history on
// this file for each. Blowing up a raster snapshot by the ~20x a click-to-focus zoom often
// needs is also just inherently blurry, independent of any of those bugs.
//
// This version never freezes a picture. It interpolates the actual camera (center + zoom)
// across DURATION_MS and, on every frame, moves Leaflet instantly (setView with
// animate:false -- no Leaflet animation machinery, nothing async to race) and asks the
// caller to redraw. The canvas already redraws crisply on every real pan/zoom step during
// normal user gestures (colonyCanvasLayer.ts's own header: "60fps on animated zoom and
// pan") -- this just drives that same proven path programmatically instead of inventing a
// second, illusion-based one.

function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number): number {
  // Binary-search the bezier parameter u such that x(u) == t, then evaluate y(u). Same
  // curve verified numerically for the CSS version this replaces (cubic-bezier(0,0,0.4,1),
  // owner ask) -- kept identical here so the eased feel doesn't change, only how it's driven.
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 20; i++) {
    u = (lo + hi) / 2;
    const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    if (x < t) lo = u;
    else hi = u;
  }
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

// The bits of ColonyCanvasLayer's internal state runFlyTo/runOpenZoom need, named rather
// than passed as `this: LayerInternals` so this file doesn't depend on colonyCanvasLayer.ts's
// own private interface (invariant 7's 250-line cap moved this extraction here, /review
// 2026-09-08 — colonyCanvasLayer.ts's flyTo() is a thin adapter over this).
export interface FlyToHost {
  map: L.Map | null;
  renderedCenter: L.LatLng | null;
  renderedZoom: number;
  // Live accessors, not snapshot values -- isCancelled below must see a LATER flight's
  // bump, not the id captured when this call started (that was the whole point of bumping
  // it on the actual layer instance in the first place).
  getFlyToId(): number;
  setFlyToId(id: number): void;
  setFlyToActive(active: boolean): void;
  resize(): void;
  render(): void;
}

// Shared by runFlyTo and runOpenZoom below — both are "animate the real camera to here over
// this duration, with this easing" and differ only in which duration/curve and which caller
// triggers them. One flight-bookkeeping implementation (flyToId bump, isCancelled, the
// onFrame/onComplete wiring into the host) rather than two copies that could drift.
function runCameraAnimation(
  host: FlyToHost,
  center: L.LatLng,
  zoom: number,
  // A fixed duration (runOpenZoom) or one computed from the actual from/to camera
  // (runFlyTo's flyToDurationMs) -- the latter needs `map` and the resolved fromCenter/
  // fromZoom below, which only exist once we're inside this function.
  durationMs: number | ((map: L.Map, fromCenter: L.LatLng, fromZoom: number, toCenter: L.LatLng, toZoom: number) => number),
  easePoints: [number, number, number, number],
): void {
  const map = host.map;
  if (!map) return;
  const fromCenter = host.renderedCenter ?? map.getCenter();
  const fromZoom = host.renderedZoom || map.getZoom();
  const duration = typeof durationMs === "function" ? durationMs(map, fromCenter, fromZoom, center, zoom) : durationMs;
  // Blocks _schedule's own move/zoom listener for the duration -- setView fires those
  // synchronously on every frame of this flight, and onFrame below already redraws
  // directly; without this they'd double up on every frame.
  host.setFlyToActive(true);
  const myId = host.getFlyToId() + 1;
  host.setFlyToId(myId);
  startCanvasFlyTo(
    map,
    fromCenter,
    fromZoom,
    center,
    zoom,
    duration,
    easePoints,
    () => host.getFlyToId() !== myId,
    () => {
      host.resize();
      host.render();
    },
    () => host.setFlyToActive(false),
  );
}

// Click-to-focus zoom (owner ask, 2026-09-04). Bumps flyToId itself so a superseded flight's
// rAF loop (isCancelled, below) stops on its next tick instead of fighting a newer one over
// the same setView/redraw every frame.
export function runFlyTo(host: FlyToHost, center: L.LatLng, zoom: number): void {
  runCameraAnimation(host, center, zoom, flyToDurationMs, FLY_TO_EASE_POINTS);
}

// The colony-open zoom-in (owner ask, 2026-09-10; moved here from a CSS transform
// 2026-09-11 — see mapOpenZoomTiming.ts's own comment on MAP_OPEN_ZOOM_EASE_POINTS for why).
// Called once the caller has already parked the map at a deliberately zoomed-out starting
// view (same centre, far lower zoom) — this just animates from wherever the map already is
// up to the colony's normal fit view, same flight machinery as runFlyTo above.
export function runOpenZoom(host: FlyToHost, center: L.LatLng, zoom: number): void {
  runCameraAnimation(host, center, zoom, MAP_OPEN_ZOOM_MS, MAP_OPEN_ZOOM_EASE_POINTS);
}

export function startCanvasFlyTo(
  map: L.Map,
  fromCenter: L.LatLng,
  fromZoom: number,
  toCenter: L.LatLng,
  toZoom: number,
  durationMs: number,
  easePoints: [number, number, number, number],
  // Checked at the top of every frame -- a second flight starting mid-flight must stop THIS
  // loop, not just let its own loop run alongside it. Two independent rAF loops both calling
  // setView every frame would fight each other for the whole overlap.
  isCancelled: () => boolean,
  onFrame: () => void,
  onComplete: () => void,
): void {
  const ease = (t: number) => cubicBezierEase(t, ...easePoints);
  // Interpolating lat/lng directly would curve or speed up unevenly once projected; doing
  // it in one fixed-zoom's projected pixel space keeps the pan visually straight-line.
  const fromPoint = map.project(fromCenter, 0);
  const toPoint = map.project(toCenter, 0);
  const start = performance.now();

  function tick(now: number) {
    if (isCancelled()) return;
    const elapsed = now - start;
    const t = Math.min(1, elapsed / durationMs);
    const e = ease(t);
    const zoom = fromZoom + (toZoom - fromZoom) * e;
    const point = fromPoint.add(toPoint.subtract(fromPoint).multiplyBy(e));
    map.setView(map.unproject(point, 0), zoom, { animate: false });
    onFrame();
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      onComplete();
    }
  }
  requestAnimationFrame(tick);
}
