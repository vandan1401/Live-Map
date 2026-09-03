import type { ColonyModel, PlotShape } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { visibleBounds, type ViewState, type Viewport } from "./view.ts";
import { drawLabels } from "./drawLabels.ts";
import { drawPlotDimensions, type DimensionConfig } from "./drawDimensions.ts";
import type { PlotDimensions } from "./usePlotDimensions.ts";
import { roundedPlotPath } from "./plotPath.ts";
import { fillDecor, pathFor } from "./drawDecor.ts";

// The painter. Ordered exactly as the SVG's paint order was, because SVG has no z-index
// and neither does canvas — draw order IS the stacking, which is the one thing this
// rewrite makes simpler (the old renderer reparented DOM nodes to fake it).
//
// Every colour comes from ColonyTheme, never a literal (D-004). Every number that encodes
// a trade-off is pinned in docs/plans/18.md §3 and repeated here with its reason.

// Owner, 2026-08-22: superseded 0.38 (itself tuned 2026-08-16 against the old grass-
// texture-showing-through design). Every plot now paints an opaque --colony-plot-base
// first (see the per-plot loop below), so this alpha only controls how much of that base
// shows through the status hue, not how much of the world ground does — the owner's new
// reference renders show a flat, near-opaque status colour.
const STATUS_FILL_ALPHA = 0.88;
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
  roadEdge: CanvasPattern | null;
  /** per-plot 0..1 progress of the 400ms status transition; absent = settled */
  transitions: Map<string, number>;
  /** stored length/breadth for the selected plot, once fetched; null while loading */
  dimensions: PlotDimensions | null;
  /** svg_ids of plots whose own geometry is a real corner cut — never corner-rounded
   * cosmetically on top of that (owner ask, 2026-08-22); see plotPathFor() below. */
  cornerPlots: ReadonlySet<string>;
}

// A corner plot's own boundary already carries its real angled/cut corner (that shape is
// the whole point of it being a corner plot) — softening it with the cosmetic rounding
// every other plot gets would misrepresent the one geometric fact a corner plot is sold
// on. Every other plot gets plotPath.ts's rounded corners (owner reference, 2026-08-22).
function plotPathFor(plot: PlotShape, state: DrawState): Path2D {
  return state.cornerPlots.has(plot.id) ? pathFor(plot) : roundedPlotPath(plot);
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

export function drawColony(
  ctx: CanvasRenderingContext2D,
  model: ColonyModel,
  view: ViewState,
  viewport: Viewport,
  theme: ColonyTheme,
  state: DrawState,
  // docs/plans/27.md — resolved from presentation.json by the caller; omitted keeps
  // drawPlotDimensions's own default (matches today's fixed spacing/text exactly).
  dimensionConfig?: DimensionConfig,
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

  // Base + status tint per plot, deliberately NOT batched by status. Batching measured 0.0
  // ms and composites the tint once across the union, so any two overlapping rings would
  // render lighter than they do today (docs/plans/18.md §3).
  for (const plot of model.plots) {
    // The selected plot is skipped here and drawn once, scaled, at the end. Painting it in
    // both places composited two tint passes, left the unscaled stroke showing 5% inside
    // the scaled one as a doubled border, and — worst — the second copy ignored
    // `transitions`, so the plot the local actor had just changed (which stays selected)
    // never showed spec/05's 400ms fade at all. /review, 2026-08-22.
    if (plot.id === state.selectedId) continue;
    const path = plotPathFor(plot, state);
    const alpha = plotAlpha(plot, state);

    // Corner rounding (plotPath.ts, D-028) insets a plot's rendered path from its true
    // footprint at each corner. The road fill above was derived from the plot's TRUE
    // footprint (site - union(plots, ...), D-104), so that inset sliver is covered by
    // neither the road fill (excludes it — it's inside the true plot) nor the plot fill
    // (rounded path excludes it), and the ground fill from the very top of this function
    // shows through instead — the "gap" between plot and road (owner ask, 2026-08-24).
    // Pre-filling the plot's raw, un-rounded footprint with road colour first closes it.
    // Skipped for a real corner plot (state.cornerPlots): its raw path already equals its
    // true footprint, so this would be a same-shape no-op fill.
    if (!state.cornerPlots.has(plot.id)) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = state.road ?? theme.road;
      ctx.fill(pathFor(plot));
      // The pre-fill above is only meant to show through in the corner sliver OUTSIDE
      // `path` (the rounded shape). Restore the ground backdrop under the plot's own
      // rounded body before the translucent plotBase/status fills below — without this, a
      // dimmed (DIM_SELECTED/DIM_FILTERED) plot would show dark road colour bleeding
      // through its whole translucent body instead of just the true corner sliver
      // (/review, 2026-08-24).
      if (alpha < 1) {
        ctx.fillStyle = state.grass ?? theme.groundBase;
        ctx.fill(path);
      }
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.plotBase;
    ctx.fill(path);

    const status = state.statuses[plot.id];
    const color = status ? theme.status[status] : null;
    if (color) {
      const progress = state.transitions.get(plot.id);
      ctx.globalAlpha = STATUS_FILL_ALPHA * alpha * (progress ?? 1);
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }
  ctx.globalAlpha = 1;

  // Strokes batched into one path: -1.0 ms, opaque, no blending to get wrong. Stroke is
  // never translucent — fill-opacity in SVG never applied to it, and letting globalAlpha
  // leak here would thin every plot boundary on the map.
  const strokes = new Path2D();
  for (const plot of model.plots) {
    if (plot.id === state.selectedId) continue; // drawn with the selection, see above
    strokes.addPath(plotPathFor(plot, state));
  }
  ctx.strokeStyle = theme.plotStroke;
  ctx.lineWidth = theme.plotStrokeWidth;
  ctx.stroke(strokes);

  // The selected plot is drawn last, scaled about its own centre — paint order is the
  // "comes above everything" effect the old renderer faked by reparenting DOM nodes.
  if (state.selectedId) {
    const plot = model.plots.find((p) => p.id === state.selectedId);
    if (plot) {
      const mx = (plot.bbox.minX + plot.bbox.maxX) / 2;
      const my = (plot.bbox.minY + plot.bbox.maxY) / 2;
      const path = plotPathFor(plot, state);
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(SELECTED_SCALE, SELECTED_SCALE);
      ctx.translate(-mx, -my);

      // Same corner-gap fix as the main loop above (D-028's rounding, docs/plans/19.md) —
      // pre-fill the true, un-rounded footprint with road colour before the rounded fill,
      // skipped for a real corner plot whose raw path already is its true footprint.
      if (!state.cornerPlots.has(plot.id)) {
        ctx.fillStyle = state.road ?? theme.road;
        ctx.fill(pathFor(plot));
      }

      ctx.fillStyle = theme.plotBase;
      ctx.fill(path);

      const status = state.statuses[plot.id];
      const color = status ? theme.status[status] : null;
      if (color) {
        ctx.globalAlpha = STATUS_FILL_ALPHA * (state.transitions.get(plot.id) ?? 1);
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = theme.plotStroke;
      ctx.lineWidth = theme.plotStrokeWidth;
      ctx.stroke(path);
      ctx.restore();
    }
  }

  // Labels draw after the selected plot's own scaled repaint above — otherwise that
  // repaint (which must come last to sit on top of every other plot) painted straight
  // over the selected plot's own number, the one label that most needs to stay legible
  // (owner ask, 2026-08-25). Every other label's position in the paint order is
  // unaffected: nothing between the old and new call sites draws on top of them.
  drawLabels(ctx, model, theme, state, bounds);

  if (state.selectedId) {
    const plot = model.plots.find((p) => p.id === state.selectedId);
    if (plot) {
      // Dimension callout last of all, so it is never painted over. Drawn only once the
      // stored length/breadth have arrived — derived from the manifest's numbers, never
      // recomputed from geometry (spec/00-rules.md, dead computation).
      const dims = state.dimensions;
      if (dims && dims.plotId === plot.id) {
        drawPlotDimensions(ctx, plot.points, dims.lengthFt, dims.breadthFt, theme, dimensionConfig);
      }
    }
  }

  ctx.restore();
}
