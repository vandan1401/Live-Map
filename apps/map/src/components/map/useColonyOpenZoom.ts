import { useEffect, type RefObject } from "react";
import type L from "leaflet";
import type { ColonyCanvasLayer } from "./colonyCanvasLayer.ts";

// Colony-open zoom-in (owner ask, 2026-09-10; moved off a CSS transform onto a real Leaflet
// zoom 2026-09-11 — see mapOpenZoomTiming.ts's own comment on MAP_OPEN_ZOOM_EASE_POINTS for
// why: the CSS version only ever scaled a viewport-sized canvas visually, so the area beyond
// wherever that shrunk box currently was showed nothing real — first a flat fallback colour,
// then a separately-tiled texture that still looked and scaled differently from the map's
// own. Driving the actual Leaflet zoom means the canvas is rendering real content, at the
// real current zoom, filling the whole viewport, at every single frame — there is no "area
// beyond the box" left to explain, because there is no box.
//
// useColonyCanvas.ts's mount effect parks the map at a deliberately zoomed-out view (this
// colony's own minZoom — varies per colony, not a shared constant) via `map.setView(
// map.getCenter(), map.getMinZoom(), ...)` right after fitBounds — the centre it reads there
// is already the real fit centre, and setView only changes the zoom, so that same centre is
// still sitting on the map when this effect later reads map.getCenter() again below; no
// separate ref needed to carry it across. Hidden behind MapLoadingScreen's splash the whole
// time. This effect just watches for that splash saying "start now" (zoomingIn — App.tsx's
// useColonyOpenSplash mapZooming) and, the one time it flips true, tells the layer to
// animate from wherever it's parked up to the real fit view. Split out of
// useColonyCanvas.ts for invariant 7's 250-line cap, same reason
// useFlyToSelectedPlot.ts/usePlotDimensions.ts were split out.
export function useColonyOpenZoom(
  mapRef: RefObject<L.Map | null>,
  layerRef: RefObject<ColonyCanvasLayer | null>,
  defaultZoomRef: RefObject<number>,
  zoomingIn: boolean,
): void {
  useEffect(() => {
    if (!zoomingIn) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.openZoomTo(map.getCenter(), defaultZoomRef.current);
  }, [zoomingIn, mapRef, layerRef, defaultZoomRef]);
}
