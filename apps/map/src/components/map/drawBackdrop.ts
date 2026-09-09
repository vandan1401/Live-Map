import { backdropPixelToWorld, type MapBackdropTransform } from "./mapBackdropTransform.ts";

// Draws one colony's synthetic-aerial backdrop image into world (SVG) space. Called from
// drawColony.ts, already inside its ctx.save()/world-transform block (docs/plans/28.md §2.8)
// -- every coordinate here is world-space, and the caller's existing translate/scale/
// translate projects it to screen exactly like every other draw call in that function.
//
// The backdrop's own forward transform (mapBackdrops.ts config) maps SVG-world -> raster-
// pixel: translate(x,y) . rotate(rotateDeg) . scale(scale). This draws the inverse: the
// canvas transform below places raster pixel (0,0) at backdropPixelToWorld(t, 0, 0), then
// rotates by -rotateDeg and scales by 1/scale so every other pixel lands at its own
// backdropPixelToWorld(t, u, v) -- see docs/plans/28.md §3 for the derivation.
// Owner, 2026-09-09: darken the raster so the colony's own plot fills (drawn opaque on top,
// drawColony.ts) pop against it. Solid fillRect alpha, not a filter (tier-3.md's no-SVG/
// canvas-filter rule) -- one extra fill of the same footprint costs nothing per frame.
const BACKDROP_DARKEN_ALPHA = 0.65;

export function drawMapBackdrop(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource | null,
  transform: MapBackdropTransform | null,
  imageWidth: number,
  imageHeight: number,
): void {
  if (!image || !transform) return;
  const [originX, originY] = backdropPixelToWorld(transform, 0, 0);
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate((-transform.rotateDeg * Math.PI) / 180);
  ctx.scale(1 / transform.scale, 1 / transform.scale);
  ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
  // Darken pass shares the exact same transform/footprint as the image above, so it can
  // never drift out of alignment with the raster it's tinting.
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = BACKDROP_DARKEN_ALPHA;
  ctx.fillRect(0, 0, imageWidth, imageHeight);
  ctx.globalAlpha = 1;
  ctx.restore();
}
