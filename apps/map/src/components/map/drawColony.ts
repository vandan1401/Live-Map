import type { ColonyModel, DecorShape, PlotShape } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { visibleBounds, type ViewState, type Viewport } from "./view.ts";
import { drawLabels } from "./drawLabels.ts";
import { drawPlotDimensions } from "./drawDimensions.ts";
import type { PlotDimensions } from "./usePlotDimensions.ts";

// The painter. Ordered exactly as the SVG's paint order was, because SVG has no z-index
// and neither does canvas — draw order IS the stacking, which is the one thing this
// rewrite makes simpler (the old renderer reparented DOM nodes to fake it).
//
// Every colour comes from ColonyTheme, never a literal (D-004). Every number that encodes
// a trade-off is pinned in docs/plans/18.md §3 and repeated here with its reason.

// Owner, 2026-08-16: 0.55 read as "too high opacity of what i am expecting". The grass
// must stay visible through a plot's status tint.
const STATUS_FILL_ALPHA = 0.38;
// Every other plot dims when one is selected. Opacity only, never a filter.
const DIM_SELECTED = 0.35;
// spec/06: the legend filter "dims everything else to 20%".
const DIM_FILTERED = 0.2;
// Owner: "remove the black border" — selection is scale, never a fill or stroke change.
const SELECTED_SCALE = 1.05;

export interface DrawState {
  statuses: Record<string, string>;
  selectedId: string | null;
  /** empty = no legend filter; otherwise only these statuses stay at full opacity */
  activeStatuses: ReadonlySet<string>;
  /** below the zoom-detail threshold, plot labels are not drawn (spec/06) */
  showPlotLabels: boolean;
  grass: CanvasPattern | null;
  road: CanvasPattern | null;
  /** per-plot 0..1 progress of the 400ms status transition; absent = settled */
  transitions: Map<string, number>;
  /** stored length/breadth for the selected plot, once fetched; null while loading */
  dimensions: PlotDimensions | null;
}

// Path2D is built lazily and cached per shape. The model deliberately holds none — it has
// to parse under jsdom, which has no Path2D — so this is where geometry becomes drawable.
const pathCache = new WeakMap<PlotShape | DecorShape, Path2D>();
function pathFor(shape: PlotShape | DecorShape): Path2D {
  let p = pathCache.get(shape);
  if (!p) {
    p = new Path2D(shape.d);
    pathCache.set(shape, p);
  }
  return p;
}

function plotAlpha(plot: PlotShape, state: DrawState): number {
  const selected = plot.id === state.selectedId;
  if (state.activeStatuses.size > 0) {
    // A /review finding: nothing used to lift the selected plot out of the filter's base
    // opacity, so selecting a filtered-out plot made it the faintest shape on screen.
    if (selected) return 1;
    return state.activeStatuses.has(state.statuses[plot.id]) ? 1 : DIM_FILTERED;
  }
  if (state.selectedId && !selected) return DIM_SELECTED;
  return 1;
}

function fillDecor(ctx: CanvasRenderingContext2D, model: ColonyModel, theme: ColonyTheme, state: DrawState) {
  for (const shape of model.decor) {
    const path = pathFor(shape);
    if (shape.cls === "site-boundary") {
      ctx.strokeStyle = theme.siteBoundary;
      ctx.lineWidth = 2;
      ctx.stroke(path);
      continue;
    }
    if (shape.cls === "road") {
      ctx.fillStyle = state.road ?? theme.road;
    } else if (shape.cls === "garden" || shape.cls === "water") {
      // The garden is the ground texture darkened, not its own texture — same photo, so
      // there is no seam or phase mismatch between two separately-tiled patterns.
      ctx.fillStyle = state.grass ?? theme.groundBase;
      ctx.fill(path);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = theme.gardenTint;
      ctx.fill(path);
      ctx.restore();
      continue;
    } else {
      ctx.fillStyle = theme.amenity;
    }
    ctx.fill(path);
  }
}

export function drawColony(
  ctx: CanvasRenderingContext2D,
  model: ColonyModel,
  view: ViewState,
  viewport: Viewport,
  theme: ColonyTheme,
  state: DrawState,
): void {
  const k = view.scale;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.translate(viewport.width / 2, viewport.height / 2);
  ctx.scale(k, k);
  ctx.translate(-view.cx, -view.cy);

  const bounds = visibleBounds(view, viewport);

  // Ground first, covering the whole viewport in world coordinates — this is what makes
  // the texture one continuous field and what replaces the separate world-ground overlay
  // (D-022's mechanism, not its look). No world-padding constant is needed any more: the
  // fill simply follows the viewport, so ground never runs out however far you pan.
  ctx.fillStyle = state.grass ?? theme.groundBase;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  fillDecor(ctx, model, theme, state);

  // Fills per plot, deliberately NOT batched by status. Batching measured 0.0 ms and
  // composites the tint once across the union, so any two overlapping rings would render
  // lighter than they do today (docs/plans/18.md §3).
  for (const plot of model.plots) {
    // The selected plot is skipped here and drawn once, scaled, at the end. Painting it in
    // both places composited two 0.38 fills into ~0.62, left the unscaled stroke showing
    // 5% inside the scaled one as a doubled border, and — worst — the second copy ignored
    // `transitions`, so the plot the local actor had just changed (which stays selected)
    // never showed spec/05's 400ms fade at all. /review, 2026-08-22.
    if (plot.id === state.selectedId) continue;
    const status = state.statuses[plot.id];
    if (!status) continue;
    const color = theme.status[status];
    if (!color) continue;
    const progress = state.transitions.get(plot.id);
    ctx.globalAlpha = STATUS_FILL_ALPHA * plotAlpha(plot, state) * (progress ?? 1);
    ctx.fillStyle = color;
    ctx.fill(pathFor(plot));
  }
  ctx.globalAlpha = 1;

  // Strokes batched into one path: -1.0 ms, opaque, no blending to get wrong. Stroke is
  // never translucent — fill-opacity in SVG never applied to it, and letting globalAlpha
  // leak here would thin every plot boundary on the map.
  const strokes = new Path2D();
  for (const plot of model.plots) {
    if (plot.id === state.selectedId) continue; // drawn with the selection, see above
    strokes.addPath(pathFor(plot));
  }
  ctx.strokeStyle = theme.plotStroke;
  ctx.lineWidth = theme.plotStrokeWidth;
  ctx.stroke(strokes);

  drawLabels(ctx, model, theme, state, bounds);

  // The selected plot is drawn last, scaled about its own centre — paint order is the
  // "comes above everything" effect the old renderer faked by reparenting DOM nodes.
  if (state.selectedId) {
    const plot = model.plots.find((p) => p.id === state.selectedId);
    if (plot) {
      const mx = (plot.bbox.minX + plot.bbox.maxX) / 2;
      const my = (plot.bbox.minY + plot.bbox.maxY) / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(SELECTED_SCALE, SELECTED_SCALE);
      ctx.translate(-mx, -my);
      const status = state.statuses[plot.id];
      const color = status ? theme.status[status] : null;
      if (color) {
        ctx.globalAlpha = STATUS_FILL_ALPHA * (state.transitions.get(plot.id) ?? 1);
        ctx.fillStyle = color;
        ctx.fill(pathFor(plot));
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = theme.plotStroke;
      ctx.lineWidth = theme.plotStrokeWidth;
      ctx.stroke(pathFor(plot));
      ctx.restore();

      // Dimension callout last of all, so it is never painted over. Drawn only once the
      // stored length/breadth have arrived — derived from the manifest's numbers, never
      // recomputed from geometry (spec/00-rules.md, dead computation).
      const dims = state.dimensions;
      if (dims && dims.plotId === plot.id) {
        drawPlotDimensions(ctx, plot.points, dims.lengthFt, dims.breadthFt, theme);
      }
    }
  }

  ctx.restore();
}
