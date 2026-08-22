import type { PlotShape } from "./colonyModel.ts";
import { roundedPolygonCorners } from "../../lib/colony/plotGeometry.ts";

// Softly-rounded plot corners (owner reference, 2026-08-22) — split out of drawColony.ts
// for invariant 7's 250-line cap. Cached per shape the same way drawColony.ts's own
// pathCache works: Path2D can't live in colonyModel.ts (jsdom has none), so it is built
// here, lazily, the first time a plot is drawn.

// A fixed fraction of the plot's own bbox, not a fixed unit count — this repo's plots
// range from Jai Dev Residency's small real ones to the shared fixture's much larger
// hand-authored ones (docs/plans/18.md), and a fixed radius reads as barely-there on one
// and cartoonish on the other. roundedPolygonCorners() still clamps per-corner to half an
// adjacent edge, so this is only ever an upper bound.
const CORNER_RADIUS_FRACTION = 0.1;

const roundedPathCache = new WeakMap<PlotShape, Path2D>();

export function roundedPlotPath(plot: PlotShape): Path2D {
  const cached = roundedPathCache.get(plot);
  if (cached) return cached;

  const maxRadius = Math.min(plot.bbox.maxX - plot.bbox.minX, plot.bbox.maxY - plot.bbox.minY) * CORNER_RADIUS_FRACTION;
  const corners = roundedPolygonCorners(plot.points, maxRadius);

  const path = new Path2D();
  if (corners.length === 0) {
    // Degenerate ring (fewer than 3 points) — fall back to the raw `d` rather than draw
    // nothing, so a malformed plot is still visible (spec/00-rules.md, not silent).
    path.addPath(new Path2D(plot.d));
  } else {
    corners.forEach((c, i) => {
      if (i === 0) path.moveTo(c.p1[0], c.p1[1]);
      else path.lineTo(c.p1[0], c.p1[1]);
      path.arcTo(c.corner[0], c.corner[1], c.p2[0], c.p2[1], c.radius);
    });
    path.closePath();
  }

  roundedPathCache.set(plot, path);
  return path;
}
