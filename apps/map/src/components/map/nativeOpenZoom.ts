import type L from "leaflet";
import { MAP_OPEN_ZOOM_MS, MAP_OPEN_ZOOM_DURATION_S, MAP_OPEN_ZOOM_EASE_LINEARITY } from "../../lib/colony/mapOpenZoomTiming.ts";

// D-043: colony-open zoom-in drives Leaflet's OWN native animated setView — the exact
// mechanism an ordinary scroll-wheel/double-click zoom already uses on this map
// (colonyCanvasLayer.ts's canvas carries leaflet-zoom-animated for this reason) — rather
// than a hand-rolled per-frame camera loop (canvasFlyTo.ts::runOpenZoom, reverted) or a
// custom CSS snapshot overlay (canvasOpenZoomSnapshot.ts, reverted same day after a real
// bug on the owner's device). Leaflet fires 'zoomend' once, at the true end of its own CSS
// transition, not once per frame — one real drawColony() there (via _schedule(), already
// wired to 'zoomend'), same as any settled user zoom, not one per animation frame.
//
// Pointer-events are dropped on the container for the flight's duration: Leaflet's pane
// transform is a pure visual transition of whatever was last really drawn, so the live
// canvas does not reflect the in-between state a real per-frame redraw would have — a click
// reaching Leaflet mid-flight would act on stale content. Restored on 'zoomend', or by the
// timeout backup if that never fires (the flight gets interrupted, e.g. the colony changes
// mid-animation) — never left stuck the way MapLoadingScreen.tsx's own pointer-events
// incident once was, since restore() is idempotent and reachable from either path.
export function runNativeOpenZoom(map: L.Map, center: L.LatLng, zoom: number): void {
  const container = map.getContainer();
  const prevPointerEvents = container.style.pointerEvents;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    container.style.pointerEvents = prevPointerEvents;
  };
  container.style.pointerEvents = "none";
  map.once("zoomend", restore);
  setTimeout(restore, MAP_OPEN_ZOOM_MS + 500);
  map.setView(center, zoom, {
    animate: true,
    duration: MAP_OPEN_ZOOM_DURATION_S,
    easeLinearity: MAP_OPEN_ZOOM_EASE_LINEARITY,
  });
}
