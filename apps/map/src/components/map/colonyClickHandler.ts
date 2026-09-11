import type L from "leaflet";
import type { ColonyModel } from "./colonyModel.ts";
import { resolveClickedPlot } from "./plotPicker.ts";
import { leafletViewState } from "./view.ts";

// Picking by geometry — React's delegated onClick used to do this through the DOM; there is
// no DOM to hit any more, so the pick is explicit. Shared by useColonyCanvas.ts and
// usePublicColonyCanvas.ts, which used to each carry an identical copy (extracted 2026-09-11
// while trimming useColonyCanvas.ts back under invariant 7's 250-line cap, not because the
// duplication itself had ever caused a bug — still worth not having two copies to drift).
// modelRef, not a plain model, so the handler doesn't need re-registering when a colony
// remount replaces the model out from under it.
export function createColonyClickHandler(
  map: L.Map,
  modelRef: { current: ColonyModel | null },
  onSelect: (svgId: string | null) => void,
): (e: L.LeafletMouseEvent) => void {
  return (e) => {
    const currentModel = modelRef.current;
    if (!currentModel) return;
    const size = map.getSize();
    const center = map.getCenter();
    const view = leafletViewState(map.getZoomScale(map.getZoom(), 0), center.lat, center.lng);
    const plot = resolveClickedPlot(
      currentModel,
      view,
      { width: size.x, height: size.y },
      e.containerPoint.x,
      e.containerPoint.y,
    );
    // Tapping the map rather than a plot dismisses the sheet (spec/03).
    onSelect(plot ? plot.id : null);
  };
}
