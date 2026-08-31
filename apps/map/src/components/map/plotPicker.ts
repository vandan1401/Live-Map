import type { ColonyModel, PlotShape } from "./colonyModel.ts";
import { screenToWorld, type ViewState, type Viewport } from "./view.ts";

// Which plot is under this point? Replaces DOM hit-testing, which disappears with the SVG
// (docs/plans/18.md). Measured at 0.028 ms/click across 675 plots — four orders of
// magnitude under a frame budget, so the obvious linear scan is the right one.
//
// Chosen over the colour-key pick buffer (0.013 ms/click) deliberately: that buffer is a
// rasterised snapshot of one particular view, so it has to be rebuilt on every pan and
// zoom, and a stale buffer picks the wrong plot silently. This has nothing to invalidate.
//
// Coordinates are SVG user units, not screen pixels — the caller converts via
// screenToWorld() so the picker never has to know about scale, dpr, or scroll.

function pointInRing(points: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pickPlotAt(model: ColonyModel, x: number, y: number): PlotShape | null {
  // Iterated last-to-first so the plot drawn on top wins a tie, matching what the eye
  // expects when two rings overlap — the same reason the SVG renderer reparented the
  // selected plot to the end of its group.
  for (let i = model.plots.length - 1; i >= 0; i--) {
    const plot = model.plots[i];
    const b = plot.bbox;
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
    if (pointInRing(plot.points, x, y)) return plot;
  }
  return null;
}

// docs/plans/25.md: the pure glue renderColonyPreview.ts's click listener needs — a
// canvas-relative pixel coordinate in, the PlotShape under it (or null) out. Composed of
// screenToWorld (view.ts) then pickPlotAt above, nothing else — kept here rather than
// inlined in the DOM-facing renderer so it stays directly unit-testable without a canvas.
export function resolveClickedPlot(
  model: ColonyModel,
  view: ViewState,
  viewport: Viewport,
  px: number,
  py: number,
): PlotShape | null {
  const [x, y] = screenToWorld(view, viewport, px, py);
  return pickPlotAt(model, x, y);
}
