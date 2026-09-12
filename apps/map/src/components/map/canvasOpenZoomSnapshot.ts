import L from "leaflet";
import { cubicBezierEase, type FlyToHost } from "./canvasFlyTo.ts";
import { MAP_OPEN_ZOOM_MS, MAP_OPEN_ZOOM_EASE_POINTS } from "../../lib/colony/mapOpenZoomTiming.ts";

// The colony-open zoom-in's own engine (2026-09-12), replacing an earlier version that
// reused runFlyTo's real-camera-every-frame approach (canvasFlyTo.ts::runOpenZoom, deleted
// here). That was correct but not free: drawColony() redraws the WHOLE scene (every plot,
// label, texture) on every single one of the flight's ~270 frames at 4.5s, and the cost per
// frame grows as the zoom climbs toward the end — a real, owner-reported fps cost that a
// pushState-skip fix (D-041) did not touch, because it was never about pushState.
//
// This version renders the DESTINATION frame exactly once (not per frame) into an overlay
// canvas, then animates a plain CSS transform: scale() on that overlay from the start
// view's scale up to exactly 1 — GPU-composited, no drawColony() call anywhere in the loop.
// The live canvas underneath is left alone for the whole flight (still showing its last real
// render, the parked start view — correct and unchanging, so there is nothing stale about
// it) and only gets one more real render, at the very end, once the overlay already matches
// it pixel-for-pixel. See canvasFlyTo.ts's own header comment for why each of the three
// bugs that killed the *previous* frozen-snapshot attempt (a different technique, for the
// much shorter click-to-focus flight) cannot recur here:
//  - No Leaflet zoomanim/_onZoomTransitionEnd hooking at all — map.setView is called exactly
//    ONCE, at the very end, the same "animate:false, redraw ourselves" idiom runFlyTo uses.
//  - No scale-direction/transform-origin ambiguity — this flight never pans (useColonyOpenZoom.ts
//    keeps the same centre throughout), so it is a pure scale from a plain, hardcoded
//    `transform-origin: center center` — there is no second axis for a sign or origin to be
//    wrong about.
//  - No blur — the overlay is painted at ITS OWN native resolution (the destination zoom's
//    real detail) and only ever scaled DOWN toward the start, then back up to exactly 1.
//    Never upscaled past native. The abandoned attempt scaled the *start* frame up ~20x.
export interface SnapshotZoomHost extends FlyToHost {
  canvas: HTMLCanvasElement | null;
  viewport: { width: number; height: number } | null;
  dpr: number;
  renderFinalFrame(ctx: CanvasRenderingContext2D, zoom: number, center: L.LatLng): void;
}

// TEMPORARY (2026-09-12) — the owner reported seeing a static start frame held for the
// whole flight then a hard cut to the final one, no visible motion in between, which this
// session has no way to reproduce or watch (rAF is suspended in a backgrounded automation
// tab). These four lines are the fastest way to find out WHERE it diverges from intended —
// remove once confirmed working, or once they've told us what the console actually shows.
const DEBUG = true;

export function runOpenZoomSnapshot(host: SnapshotZoomHost, finalCenter: L.LatLng, finalZoom: number): void {
  const map = host.map;
  const liveCanvas = host.canvas;
  const viewport = host.viewport;
  const parent = liveCanvas?.parentElement ?? null;
  if (!map || !liveCanvas || !viewport || !parent) {
    if (DEBUG) console.log("[open-zoom] bailed on missing map/canvas/viewport/parent", { map: !!map, liveCanvas: !!liveCanvas, viewport, parent: !!parent });
    return;
  }
  const fromZoom = host.renderedZoom || map.getZoom();

  host.setFlyToActive(true);
  const myId = host.getFlyToId() + 1;
  host.setFlyToId(myId);
  const isCancelled = () => host.getFlyToId() !== myId;

  // The live canvas underneath is deliberately left stale (still showing the start framing)
  // for the whole flight — a click, drag, or wheel-zoom reaching Leaflet during this
  // decorative, non-interactive reveal would act on that stale picture, not on whatever the
  // overlay currently shows. Disabling pointer-events on the whole container (not just
  // stopping a click on some new element) is the one lever that reliably covers every one of
  // Leaflet's own listeners — drag/tap/wheel alike — without having to name each of them;
  // restored from cleanup() below, the single teardown path every exit (complete, cancelled,
  // no-2d-context) already goes through, so it can't be left stuck the way MapLoadingScreen's
  // own pointer-events bug once was (that one's cleanup was skippable; this one is not).
  const containerEl = map.getContainer();
  const prevPointerEvents = containerEl.style.pointerEvents;
  containerEl.style.pointerEvents = "none";

  // wrapper: full-viewport, never transformed — just a positioning host so overlay's own
  // scale transform (below) doesn't have to fight Leaflet's own translate3d positioning on
  // the same element.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:absolute;left:0;top:0;width:${viewport.width}px;height:${viewport.height}px;`;
  L.DomUtil.setPosition(wrapper, map.containerPointToLayerPoint([0, 0]));

  const overlay = document.createElement("canvas");
  const dpr = host.dpr || 1;
  overlay.width = Math.max(1, Math.round(viewport.width * dpr));
  overlay.height = Math.max(1, Math.round(viewport.height * dpr));
  overlay.style.cssText = `width:100%;height:100%;display:block;position:absolute;left:0;top:0;transform-origin:center center;`;
  const ctx = overlay.getContext("2d");
  if (!ctx) {
    if (DEBUG) console.log("[open-zoom] no 2d context on overlay — falling back to an instant cut");
    // jsdom / no 2d backend (same fallback _render() already relies on) — nothing to
    // animate; leave the live map exactly where useColonyOpenZoom.ts's caller will still
    // move it to below, just without the visual flourish.
    containerEl.style.pointerEvents = prevPointerEvents;
    host.setFlyToActive(false);
    map.setView(finalCenter, finalZoom, { animate: false });
    host.resize();
    host.render();
    return;
  }
  host.renderFinalFrame(ctx, finalZoom, finalCenter);

  wrapper.appendChild(overlay);
  parent.appendChild(wrapper);

  const startScale = Math.pow(2, fromZoom - finalZoom); // <1 — fromZoom is always the more-zoomed-out start
  overlay.style.transform = `scale(${startScale})`;
  if (DEBUG) {
    console.log("[open-zoom] started", { fromZoom, finalZoom, startScale, viewport, dpr, myId });
    console.log("[open-zoom] overlay in DOM?", parent.contains(wrapper), "children of parent:", parent.children.length);
  }

  function cleanup() {
    wrapper.remove();
    containerEl.style.pointerEvents = prevPointerEvents;
  }

  const ease = (t: number) => cubicBezierEase(t, ...MAP_OPEN_ZOOM_EASE_POINTS);
  const start = performance.now();
  let loggedFrames = 0;
  // An arrow function assigned to a const, not a hoisted `function` declaration -- TS only
  // carries the `map`-is-non-null narrowing from the guard above into a closure defined
  // after it, not into one that's hoisted above it.
  const tick = (now: number) => {
    if (isCancelled()) {
      if (DEBUG) console.log("[open-zoom] cancelled by a later flight (id mismatch) — tearing down early", { myId, current: host.getFlyToId() });
      cleanup();
      return;
    }
    const t = Math.min(1, (now - start) / MAP_OPEN_ZOOM_MS);
    const scale = startScale + (1 - startScale) * ease(t);
    overlay.style.transform = `scale(${scale})`;
    if (DEBUG && loggedFrames < 6) {
      console.log("[open-zoom] frame", { t: t.toFixed(3), scale: scale.toFixed(3) });
      loggedFrames++;
    }
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    if (DEBUG) console.log("[open-zoom] finished — landing live map on destination and removing overlay");
    // Land the real map on the destination view and repaint it for real, THEN remove the
    // overlay — both synchronous, same tick, so there is no gap for a stale frame to flash.
    map.setView(finalCenter, finalZoom, { animate: false });
    host.resize();
    host.render();
    cleanup();
    host.setFlyToActive(false);
  };
  requestAnimationFrame(tick);
}
