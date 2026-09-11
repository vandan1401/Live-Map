import type { ColonyModel } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { drawColony, type DrawState } from "./drawColony.ts";
import type { DimensionConfig } from "./drawDimensions.ts";
import { leafletViewState, type Viewport } from "./view.ts";

// The pure half of colonyCanvasLayer.ts's own _render(): given a model/theme/state and an
// explicit center+zoom, paint one frame into ctx. No Leaflet map dependency at all — center
// and zoom are plain numbers, not read from a live map — which is exactly what makes this
// reusable for canvasOpenZoomSnapshot.ts's one-off capture of a *different* (destination)
// zoom than whatever the live map is currently sitting at, split out 2026-09-12 rather than
// duplicating _render()'s own view/transform math a second time.
export function renderCanvasFrame(
  ctx: CanvasRenderingContext2D,
  model: ColonyModel,
  theme: ColonyTheme,
  state: DrawState,
  dimensionConfig: DimensionConfig | undefined,
  viewport: Viewport,
  dpr: number,
  zoom: number,
  centerLat: number,
  centerLng: number,
): void {
  // L.CRS.Simple: screen-px-per-SVG-unit = 2^zoom (view.ts's own header comment) — same
  // relationship map.getZoomScale(zoom, 0) returns, computed directly so this file never
  // needs a live L.Map reference.
  const view = leafletViewState(Math.pow(2, zoom), centerLat, centerLng);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawColony(ctx, model, view, viewport, theme, state, dimensionConfig);
}
