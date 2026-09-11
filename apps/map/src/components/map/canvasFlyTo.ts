import L from "leaflet";

const FLY_TO_DURATION_MS = 400; // owner ask, 2026-09-04 — click-to-focus-a-plot's own pace
const FLY_TO_EASE_POINTS: [number, number, number, number] = [0, 0, 0.4, 1]; // owner ask, same day

// Rebuilt from scratch (2026-09-04) after three attempts at animating a CSS transform on a
// frozen raster snapshot of the old view all failed for different reasons (a real Leaflet
// lifecycle bug in the zoomanim pipeline, an inverted scale, a backwards direction, and
// finally a missing transform-origin that undid all of the above) -- see git history on
// this file for each. Blowing up a raster snapshot by the ~20x a click-to-focus zoom often
// needs is also just inherently blurry, independent of any of those bugs.
//
// runFlyTo below never freezes a picture: it interpolates the actual camera (center + zoom)
// across DURATION_MS and, on every frame, moves Leaflet instantly (setView with
// animate:false -- no Leaflet animation machinery, nothing async to race) and asks the
// caller to redraw. The canvas already redraws crisply on every real pan/zoom step during
// normal user gestures (colonyCanvasLayer.ts's own header: "60fps on animated zoom and
// pan") -- this just drives that same proven path programmatically instead of inventing a
// second, illusion-based one. That reasoning is scoped to a click-to-focus-length flight,
// where a real per-frame redraw is cheap relative to the 400ms budget.
//
// The colony-open zoom-in (2026-09-10) is a different shape of problem: 4.5s, not 400ms, so
// a real drawColony() every frame costs measurably more overall, and it starts from behind
// an opaque loading splash where nothing is interactive yet -- so a frozen raster is safe
// there in a way it structurally cannot be for a live, clickable 400ms flight. It reuses a
// frozen SNAPSHOT OF THE DESTINATION frame (never the start frame), scaled DOWN from 1 to
// the start framing and back up to exactly 1 -- never upscaled past native resolution, which
// is what made the abandoned attempts above blurry -- composited over the real (unmoving,
// correctly-rendered) live canvas rather than replacing it, so there is always something
// real behind it. See canvasOpenZoomSnapshot.ts::runOpenZoomSnapshot for the mechanism and
// why each of the three bugs above specifically cannot recur there.

export function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number): number {
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

// The bits of ColonyCanvasLayer's internal state runFlyTo needs, named rather than passed
// as `this: LayerInternals` so this file doesn't depend on colonyCanvasLayer.ts's own
// private interface (invariant 7's 250-line cap moved this extraction here, /review
// 2026-09-08 — colonyCanvasLayer.ts's flyTo() is a thin adapter over this). Also reused,
// extended with a few more fields, by canvasOpenZoomSnapshot.ts's SnapshotZoomHost.
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

// runFlyTo's own "animate the real camera to here over this duration, with this easing"
// engine. Split out from runFlyTo itself so a future second live-camera caller (there is
// only one today) could reuse it without copying the flyToId bump/isCancelled wiring.
function runCameraAnimation(
  host: FlyToHost,
  center: L.LatLng,
  zoom: number,
  durationMs: number,
  easePoints: [number, number, number, number],
): void {
  const map = host.map;
  if (!map) return;
  const fromCenter = host.renderedCenter ?? map.getCenter();
  const fromZoom = host.renderedZoom || map.getZoom();
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
    durationMs,
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
  runCameraAnimation(host, center, zoom, FLY_TO_DURATION_MS, FLY_TO_EASE_POINTS);
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
