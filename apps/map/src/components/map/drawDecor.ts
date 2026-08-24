import type { ColonyModel, DecorShape, PlotShape } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { gardenBlobsFor } from "./gardenDecoration.ts";
import type { DrawState } from "./drawColony.ts";

// Static decoration (site boundary, road, garden, amenity, water) plus the shared Path2D
// cache. Split out of drawColony.ts for invariant 7's 250-line cap (/review, 2026-08-24) —
// drawColony.ts calls fillDecor() once per frame and reuses pathFor() for plots too.

// Garden blob decoration alpha — low enough that the flat --colony-garden-base underneath
// still reads as the dominant colour, high enough that the two-tone scatter is visible.
const GARDEN_BLOB_ALPHA = 0.6;

// Path2D is built lazily and cached per shape. The model deliberately holds none — it has
// to parse under jsdom, which has no Path2D — so this is where geometry becomes drawable.
const pathCache = new WeakMap<PlotShape | DecorShape, Path2D>();
export function pathFor(shape: PlotShape | DecorShape): Path2D {
  let p = pathCache.get(shape);
  if (!p) {
    p = new Path2D(shape.d);
    pathCache.set(shape, p);
  }
  return p;
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

export function fillDecor(ctx: CanvasRenderingContext2D, model: ColonyModel, theme: ColonyTheme, state: DrawState) {
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
      ctx.fill(path);
      // Inner trim along every road edge — outer (against the site boundary) and inner
      // (against every plot/garden/amenity/water edge) alike, since the road is one
      // compound path and there is no separate "pathway" class to target instead (owner
      // ask, 2026-08-24; docs/plans/19.md). 4 SVG user units (widened from 1, same day,
      // owner ask) — grows with zoom like every other stroke width in this file.
      ctx.strokeStyle = state.roadEdge ?? theme.roadEdge;
      ctx.lineWidth = 4;
      ctx.stroke(path);
      continue;
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
