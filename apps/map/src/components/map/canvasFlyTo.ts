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

// The bits of ColonyCanvasLayer's internal state runFlyTo needs, named rather than passed
// as `this: LayerInternals` so this file doesn't depend on colonyCanvasLayer.ts's own
// private interface (invariant 7's 250-line cap moved this extraction here, /review
// 2026-09-08 — colonyCanvasLayer.ts's flyTo() is now a thin adapter over this).
export interface FlyToHost {
  map: L.Map | null;
  renderedCenter: L.LatLng | null;
  renderedZoom: number;
  // Live accessors, not snapshot values -- isCancelled below must see a LATER flyTo call's
  // bump, not the id captured when this call started (that was the whole point of bumping
  // it on the actual layer instance in the first place).
  getFlyToId(): number;
  setFlyToId(id: number): void;
  setFlyToActive(active: boolean): void;
  resize(): void;
  render(): void;
}

// Click-to-focus zoom. Bumps flyToId itself so a superseded flight's rAF loop (isCancelled,
// below) stops on its next tick instead of fighting a newer one over the same setView/
// redraw every frame — same reasoning colonyCanvasLayer.ts's own comment used to carry.
export function runFlyTo(host: FlyToHost, center: L.LatLng, zoom: number): void {
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
    () => host.getFlyToId() !== myId,
    () => {
      host.resize();
      host.render();
    },
    () => host.setFlyToActive(false),
  );
}

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
