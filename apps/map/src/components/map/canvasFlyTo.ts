import L from "leaflet";

const DURATION_MS = 400; // owner ask, 2026-09-04

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

const ease = (t: number) => cubicBezierEase(t, 0, 0, 0.4, 1);

export function startCanvasFlyTo(
  map: L.Map,
  fromCenter: L.LatLng,
  fromZoom: number,
  toCenter: L.LatLng,
  toZoom: number,
  // Checked at the top of every frame -- a second flyTo starting mid-flight must stop THIS
  // loop, not just let its own loop run alongside it. Two independent rAF loops both calling
  // setView every frame would fight each other for the whole overlap.
  isCancelled: () => boolean,
  onFrame: () => void,
  onComplete: () => void,
): void {
  // Interpolating lat/lng directly would curve or speed up unevenly once projected; doing
  // it in one fixed-zoom's projected pixel space keeps the pan visually straight-line.
  const fromPoint = map.project(fromCenter, 0);
  const toPoint = map.project(toCenter, 0);
  const start = performance.now();

  function tick(now: number) {
    if (isCancelled()) return;
    const elapsed = now - start;
    const t = Math.min(1, elapsed / DURATION_MS);
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
