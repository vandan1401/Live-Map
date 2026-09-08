// Pure geometry for one colony's synthetic-aerial backdrop (docs/plans/28.md, D-036).
//
// The backdrop raster and the colony's own SVG were aligned offline (experiments/
// map-texture-poc/stitch.html, manual eyeball placement -- no real surveyed anchor points
// exist yet for Bharatkshetra) as a similarity transform, SVG-world -> raster-pixel:
// rotate by rotateDeg degrees, scale by `scale`, translate by (x, y), transform-origin
// (0, 0) -- exactly bake_static.html's CSS `translate(x,y) rotate(rotateDeg) scale(scale)`.
//
// drawBackdrop.ts needs the INVERSE (raster-pixel -> SVG-world) to place the image under
// the live colony render; mapBackdrops.ts's config stores the forward transform (the shape
// the offline stitching tool already produces), so both directions live here together.

export interface MapBackdropTransform {
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
}

export function worldToBackdropPixel(t: MapBackdropTransform, wx: number, wy: number): [number, number] {
  const theta = (t.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rx = t.x + t.scale * (cos * wx - sin * wy);
  const ry = t.y + t.scale * (sin * wx + cos * wy);
  return [rx, ry];
}

export function backdropPixelToWorld(t: MapBackdropTransform, px: number, py: number): [number, number] {
  const theta = (t.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const ux = px - t.x;
  const uy = py - t.y;
  const wx = (cos * ux + sin * uy) / t.scale;
  const wy = (-sin * ux + cos * uy) / t.scale;
  return [wx, wy];
}

// The backdrop raster's own axis-aligned world-space bounding box (its 4 corners' world
// positions, min/maxed -- rotateDeg tilts it slightly, so this is not simply imageWidth/
// imageHeight divided by scale).
//
// This is a CIRCUMSCRIBING box, not a coverage bound: whenever rotateDeg != 0 it is a
// strict SUPERSET of the real raster, overhanging its true edges by a wedge on every side
// (a `/review` 2026-09-08 finding — the box answers "where might this raster be", not
// "what area does it actually cover"). Do not feed this directly into anything that must
// stay inside the real photo (a minZoom/maxBounds derivation, a coverage check) — use
// `backdropCoveredWorldBounds` below for that; it exists specifically because an earlier
// version of that derivation used this box directly and left visible bare-grass wedges at
// the image's real edges even while nominally "covering the viewport".
export function backdropWorldBounds(
  t: MapBackdropTransform,
  imageWidth: number,
  imageHeight: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const corners = [
    backdropPixelToWorld(t, 0, 0),
    backdropPixelToWorld(t, imageWidth, 0),
    backdropPixelToWorld(t, 0, imageHeight),
    backdropPixelToWorld(t, imageWidth, imageHeight),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// The largest axis-aligned rectangle INSCRIBED in the raster's tilted true footprint --
// every point inside this box is real raster pixels, never a bare-grass wedge past its
// rotated edge. useMapBackdrop.ts's applyBackdropMinZoom uses this (not the circumscribing
// backdropWorldBounds above) to derive minZoom/maxBounds for exactly that reason (a 4th
// /review 2026-09-08 pass). Insets backdropWorldBounds's box by the rotation overhang on
// each axis: `(otherAxisLength/scale) * |sin(rotateDeg)|`.
//
// This inset only stays positive-area up to a real rotation limit -- past
// |rotateDeg| = atan(imageHeight/imageWidth) (33.7 deg for 1440x960) the Y inset alone
// exceeds half the circumscribed box's height and the result inverts (minY > maxY). A 5th
// /review 2026-09-08 pass found nothing downstream would have caught that: Leaflet's own
// LatLngBounds silently normalises an inverted pair, so a future colony's manual alignment
// landing past this limit would derive a wrong, unflagged minZoom/maxBounds. Fail loudly
// instead -- Bharatkshetra's own rotateDeg (2.5) is nowhere near this limit.
export function backdropCoveredWorldBounds(
  t: MapBackdropTransform,
  imageWidth: number,
  imageHeight: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const r = backdropWorldBounds(t, imageWidth, imageHeight);
  const s = Math.abs(Math.sin((t.rotateDeg * Math.PI) / 180));
  const dx = (imageHeight / t.scale) * s;
  const dy = (imageWidth / t.scale) * s;
  const bounds = { minX: r.minX + dx, minY: r.minY + dy, maxX: r.maxX - dx, maxY: r.maxY - dy };
  if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    throw new Error(
      `backdropCoveredWorldBounds: rotateDeg=${t.rotateDeg} is too steep for a ${imageWidth}x${imageHeight} ` +
        "raster -- the inscribed coverage rectangle has zero or negative area. Re-check this colony's " +
        "manual alignment; a rotation this steep is very unlikely to be correct.",
    );
  }
  return bounds;
}
