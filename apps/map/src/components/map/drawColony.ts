import type { ColonyModel, DecorShape, PlotShape } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { visibleBounds, type ViewState, type Viewport } from "./view.ts";
import { drawLabels } from "./drawLabels.ts";
import { drawPlotDimensions } from "./drawDimensions.ts";
import type { PlotDimensions } from "./usePlotDimensions.ts";
import { roundedPlotPath } from "./plotPath.ts";
import { gardenBlobsFor } from "./gardenDecoration.ts";

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
// Garden blob decoration alpha — low enough that the flat --colony-garden-base underneath
// still reads as the dominant colour, high enough that the two-tone scatter is visible
// (gardenDecoration.ts).
const GARDEN_BLOB_ALPHA = 0.6;

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
  /** svg_ids of plots whose own geometry is a real corner cut — never corner-rounded
   * cosmetically on top of that (owner ask, 2026-08-22); see plotPathFor() below. */
  cornerPlots: ReadonlySet<string>;
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

// clubhouse/playground are the open recreational amenities (the owner's reference render's
// green "CLUB"/"PARTY PLOT" boxes); every other data-kind (temple, tank, parking, reserved,
// unplanned/other) is a built structure or held land and stays the neutral tone so it never
// competes visually with genuine open space.
function amenityFillFor(shape: DecorShape, theme: ColonyTheme): string {
  return shape.kind === "clubhouse" || shape.kind === "playground" ? theme.amenityAccent : theme.amenity;
}

function fillGarden(ctx: CanvasRenderingContext2D, shape: DecorShape, theme: ColonyTheme, path: Path2D) {
  ctx.fillStyle = theme.gardenBase;
  ctx.fill(path);

  // Clip to the garden's own outline so the scattered blobs never bleed past it — cheaper
  // than intersecting each blob circle against the polygon by hand, and this clip region
  // is popped by the caller's own save/restore.
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha = GARDEN_BLOB_ALPHA;
  for (const blob of gardenBlobsFor(shape)) {
    ctx.fillStyle = blob.light ? theme.gardenBlobLight : theme.gardenTint;
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
    } else if (shape.cls === "water") {
      ctx.fillStyle = theme.water;
    } else if (shape.cls === "garden") {
      fillGarden(ctx, shape, theme, path);
      continue;
    } else {
      ctx.fillStyle = amenityFillFor(shape, theme);
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

  drawLabels(ctx, model, theme, state, bounds);

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
