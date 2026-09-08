import L from "leaflet";
import type { MapBackdropLabel } from "./mapBackdrops.ts";
import { colonyLatLng } from "./view.ts";

// docs/plans/28.md §2.7: one real-map-style label per backdrop place/road name, positioned
// via Leaflet's own marker system rather than reimplementing pan/zoom-tracking math -- the
// existing lat=-y,lng=x convention (view.ts's colonyLatLngBounds/leafletViewState) already
// makes a world (x, y) point a valid Leaflet LatLng with zero new coordinate math.
//
// No zoom-based reveal/fade threshold (dropped 2026-09-08, /review): a label's world
// position is 1.3x-10x the colony's own extent away, so whether it's visible at all is
// already entirely decided by Leaflet's normal pan/zoom clipping -- a village name simply
// isn't on screen until the visitor has panned/zoomed to where it actually is, the same way
// every other Leaflet marker works. A hand-tuned "reveal past this zoom" threshold was
// real-map-visual-flavor copied from the standalone prototype without checking it against
// this app's actual fitBounds-to-colony framing, and every threshold came out unreachable
// or backwards once checked against real numbers.

function iconFor(label: MapBackdropLabel): L.DivIcon {
  const className = label.kind === "road" ? "map-backdrop-label map-backdrop-label-road" : "map-backdrop-label";
  const inner =
    label.kind === "road"
      ? `<span class="map-backdrop-label-text">${label.text}</span>`
      : `<span class="map-backdrop-label-pin"></span><span class="map-backdrop-label-text">${label.text}</span>`;
  return L.divIcon({ className, html: inner, iconSize: [0, 0] });
}

export interface BackdropLabelLayer {
  destroy(): void;
}

export function createBackdropLabelLayer(map: L.Map, labels: MapBackdropLabel[]): BackdropLabelLayer {
  const markers = labels.map((label) => {
    const marker = L.marker(colonyLatLng(label.worldX, label.worldY), {
      icon: iconFor(label),
      interactive: false,
      keyboard: false,
    });
    marker.addTo(map);
    return marker;
  });

  return {
    destroy: () => {
      for (const marker of markers) marker.remove();
    },
  };
}
