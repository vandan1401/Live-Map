import type { ColonyModel } from "./colonyModel.ts";

// The view transform the canvas layer draws with. Leaflet still owns the map and every
// gesture (D-009, upheld — see docs/plans/18.md); this is the pure maths that turns its
// state into draw parameters, kept separate so it can be tested without a live map.
// `scale` is CSS pixels per SVG user unit; (cx, cy) is the SVG-space point at the centre
// of the viewport. Everything else derives from those three numbers.
//
// L.CRS.Simple maps latitude to -y, so a Leaflet centre is (lng, viewBoxHeight - lat) in
// SVG space. That mismatch has already caused one real bug here, so leafletViewState()
// below is the ONLY place it is written down. Never inline the flip a second time.

export interface ViewState {
  scale: number;
  cx: number;
  cy: number;
}

export interface Viewport {
  width: number;
  height: number;
}

// Margin below the fit scale at which plot labels stop being drawn (spec/06). Derived
// from the fit scale every mount, never an absolute number — a hardcoded threshold went
// stale the moment a fixture's aspect ratio changed.
export const ZOOM_DETAIL_MARGIN = 0.3;
// Fly-to-plot lands at this ABSOLUTE Leaflet zoom, as it did before the canvas rewrite.
// Raised from 2 to 3.4 same day (owner ask, 2026-08-22: "only a few nearby plots should be
// visible" on selection) — this explicitly supersedes docs/plans/18.md §3/§4's earlier pin
// at 2 and its "forbids re-tuning" note, which reflected an earlier, different owner
// preference (see the historical account below). Still short of maxZoom (4 in
// useColonyCanvas.ts) so a selection never hits the hard ceiling.
//
// History: a first pass made this relative to the fit zoom, reasoning that fit is near 0
// — true on a desktop, false on a phone: this repo's fixture is 1000x1390, so at 390x780
// fit is about -1.36 and "fit + 2" lands near 0.64, roughly 2.6x less zoomed than the owner
// had approved at the time (/review, 2026-08-22). That review is why this stayed an
// absolute number when it was raised again the same day.
export const SELECT_ZOOM = 3.4;

export function fitScale(model: ColonyModel, viewport: Viewport): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(viewport.width / model.width, viewport.height / model.height);
}

export function fitView(model: ColonyModel, viewport: Viewport): ViewState {
  return { scale: fitScale(model, viewport), cx: model.width / 2, cy: model.height / 2 };
}

export function screenToWorld(view: ViewState, viewport: Viewport, px: number, py: number): [number, number] {
  return [
    (px - viewport.width / 2) / view.scale + view.cx,
    (py - viewport.height / 2) / view.scale + view.cy,
  ];
}

export function worldToScreen(view: ViewState, viewport: Viewport, x: number, y: number): [number, number] {
  return [
    (x - view.cx) * view.scale + viewport.width / 2,
    (y - view.cy) * view.scale + viewport.height / 2,
  ];
}

// The SVG-space rectangle currently on screen. The draw layer culls labels against this —
// mandatory, not an optimisation: un-culled labels were 20.6 ms of a 37.5 ms frame
// (docs/plans/18.md §1), and a phone pushes ~2.7x the pixels this was measured on.
export function visibleBounds(view: ViewState, viewport: Viewport) {
  const halfW = viewport.width / (2 * view.scale);
  const halfH = viewport.height / (2 * view.scale);
  return { minX: view.cx - halfW, minY: view.cy - halfH, maxX: view.cx + halfW, maxY: view.cy + halfH };
}


// The single place Leaflet's coordinate system meets the renderer's.
//
// L.CRS.Simple's transformation is (1, 0, -1, 0): a projected point is (lng, -lat). So if
// we bind SVG space to Leaflet as **lat = -y, lng = x**, the projection becomes the
// identity and there is no flip left to get wrong anywhere else. That is why the colony's
// bounds are [[-height, 0], [0, width]] and not the more obvious [[0, 0], [height, width]]
// — the obvious one mirrors the map, which looks entirely plausible (every plot present,
// every road connected) and has already cost this codebase one real bug.
export function colonyLatLngBounds(width: number, height: number): [[number, number], [number, number]] {
  return [
    [-height, 0],
    [0, width],
  ];
}

export function leafletViewState(zoomScale: number, centerLat: number, centerLng: number): ViewState {
  return { scale: zoomScale, cx: centerLng, cy: -centerLat };
}
