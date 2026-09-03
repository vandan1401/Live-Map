import L from "leaflet";

const DURATION_MS = 400; // owner ask, 2026-09-04 -- was 250ms

// Split out of colonyCanvasLayer.ts for invariant 7's 250-line cap (same reason
// useFlyToSelectedPlot.ts/usePlotDimensions.ts were split out of useColonyCanvas.ts).
//
// Deliberately does NOT use Leaflet's own animated setView({animate:true}) + 'zoomanim'
// pipeline. That was tried first (mirroring Leaflet's private Renderer._onAnimZoom) and hit
// a real Leaflet lifecycle bug: its internal _onZoomTransitionEnd is scheduled via a bare
// setTimeout with no cancellation hook, so tearing down/recreating the map (a React
// remount, a fast second click) while one is still pending throws deep inside Leaflet
// ("Cannot read properties of undefined (reading '_leaflet_pos')", confirmed via console
// during manual testing) — and the 'zoom'/'zoomend' events our own redraw depends on never
// fire, leaving the canvas stuck mid-transform. Moving the map instantly (no Leaflet
// animation, no internal pending timer) and animating the canvas ourselves needs none of
// that, so there is nothing left for a torn-down map to race against.
//
// The maths mirror Leaflet's own Renderer._updateTransform (leaflet-src.js), rebuilt on
// public API only: where the OLD (already-drawn) canvas content must sit, scaled, to line
// up with the NEW view the map already reports (map.setView ran before this is called).
//
// Direction matters and was wrong in an earlier version: the canvas's CURRENT transform
// (whatever _render() last set) already shows the correct "before" appearance -- untouched,
// it's the right start. The computed (offset, scale) below is the END of the animation (an
// approximation of the new framing, built from the still-old bitmap), not the start.
// Animating the other way around -- snapping straight to the blown-up target, then easing
// back to identity -- looks exactly like what was reported: a flash of the wrong content
// that shrinks back to the old overview before the real zoomed plot suddenly appears.
export function startCanvasFlyTo(
  map: L.Map,
  canvas: HTMLCanvasElement,
  fromCenter: L.LatLng,
  fromZoom: number,
  onComplete: () => void,
): void {
  // getZoomScale(toZoom, fromZoom) -- target first. Zooming IN means fromZoom < map.getZoom(),
  // so the old (more-zoomed-out) content must be ENLARGED (scale > 1) to approximate the new
  // pixel density.
  const scale = map.getZoomScale(map.getZoom(), fromZoom);
  const viewHalf = map.getSize().divideBy(2);
  const oldCenterPoint = map.project(fromCenter, map.getZoom());
  const pixelOrigin = map.project(map.getCenter(), map.getZoom()).subtract(viewHalf).round();
  const targetOffset = viewHalf.multiplyBy(-scale).add(oldCenterPoint).subtract(pixelOrigin);

  canvas.getBoundingClientRect(); // commit whatever transform is already showing, pre-transition
  canvas.style.transition = `transform ${DURATION_MS}ms cubic-bezier(0,0,0.4,1)`;
  requestAnimationFrame(() => L.DomUtil.setTransform(canvas, targetOffset, scale));

  const finish = () => {
    canvas.style.transition = "";
    canvas.removeEventListener("transitionend", finish);
    onComplete();
  };
  canvas.addEventListener("transitionend", finish);
  setTimeout(finish, DURATION_MS + 50); // transitionend can miss (interrupted, backgrounded tab); this can't
}
