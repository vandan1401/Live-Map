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
  ctx.restore();
}
