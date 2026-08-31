import { useEffect, type RefObject } from "react";
import L from "leaflet";
import type { ColonyModel } from "./colonyModel.ts";
import { computeSelectZoom } from "./view.ts";

// Selected plot lands at this fraction of the viewport's height, not 0.5 (owner ask,
// 2026-08-22): the bottom toolbar/legend sheet covers the lower part of the screen, so
// centring a plot at 50% put it half-hidden. 0.35 was chosen over the more literal "65%
// from the bottom" phrasing because a screen fraction has to be measured from one edge,
// and every other on-screen fraction in this codebase (viewport/label math) is top-down.
const SELECT_VERTICAL_ANCHOR = 0.35;

// Flying to a plot is a SEPARATE effect keyed only on the selection (and the colony's own
// zoom reference, which never changes mid-session). Folding it into the mount/repaint
// effect meant tapping a legend chip while a plot was selected re-centred and re-zoomed the
// map under the user's finger (/review, 2026-08-22). Split out of useColonyCanvas.ts for
// invariant 7's 250-line cap, same reason usePlotDimensions.ts was split out.
export function useFlyToSelectedPlot(
  mapRef: RefObject<L.Map | null>,
  modelRef: RefObject<ColonyModel | null>,
  selectedId: string | null,
  selectZoomRefWidthPx: number | null,
  selectZoomRefHeightPx: number | null,
): void {
  useEffect(() => {
    const map = mapRef.current;
    const model = modelRef.current;
    if (!map || !model || !selectedId) return;
    const plot = model.plots.find((p) => p.id === selectedId);
    if (!plot) return;
    const cx = (plot.bbox.minX + plot.bbox.maxX) / 2;
    const cy = (plot.bbox.minY + plot.bbox.maxY) / 2;
    const target: L.LatLngExpression = [-cy, cx];

    // setView always puts its target at the exact centre (50% height) of the container.
    // To land it at SELECT_VERTICAL_ANCHOR instead, project the target at the destination
    // zoom, subtract where we actually want it to sit on screen, and unproject back to the
    // latlng that belongs at the centre — standard Leaflet "pan to an offset point" maths;
    // there is no setView option for this.
    const size = map.getSize();

    // docs/plans/20.md: SELECT_ZOOM was a single fixed zoom applied identically to every
    // colony, which produced wildly different real-world framing since every colony's SVG
    // is normalised to the same viewBox width regardless of its real footprint (D-110). A
    // colony with an owner-drawn COL-ZOOM-REF rectangle gets a zoom computed to fit exactly
    // that rectangle instead. computeSelectZoom clamps to [minZoom, maxZoom] itself, and
    // that clamped value is what must go into project/unproject below, not a raw one —
    // see its own comment (view.ts) for why.
    const zoom = computeSelectZoom(
      { width: size.x, height: size.y },
      selectZoomRefWidthPx,
      selectZoomRefHeightPx,
      map.getMinZoom(),
      map.getMaxZoom(),
    );

    const desiredScreenPoint = L.point(size.x / 2, size.y * SELECT_VERTICAL_ANCHOR);
    const targetPoint = map.project(target, zoom);
    const centerPoint = targetPoint.subtract(desiredScreenPoint).add(size.divideBy(2));
    const center = map.unproject(centerPoint, zoom);

    map.setView(center, zoom, { animate: true });
  }, [mapRef, modelRef, selectedId, selectZoomRefWidthPx, selectZoomRefHeightPx]);
}
