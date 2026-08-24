// The ground texture, ported from mapTexturePatterns.ts's SVG <pattern> defs to canvas
// patterns (docs/plans/18.md). Same owner-supplied photo, same 2x2 mirror scheme, same
// tile size — only the mechanism changes. Measured at +2.3 ms over a flat fill, so the
// texture that looked expensive under SVG is nearly free here.

// Owner's photo is 220x198. 90x81 repeated ~5.5 times across the site and the photo's own
// swirl structure made the repeat read as an obvious kaleidoscope (owner: "it is making a
// pattern i dont want that"). Fewer, larger repeats are far less noticeable.
export const GRASS_TILE_W = 160;
export const GRASS_TILE_H = 144; // matches the source photo's 220:198 aspect ratio
// Each quadrant is grown a hair beyond its own bounds: with exact quadrants the browser's
// edge antialiasing left a faint grid line at every join, even though the mirrored content
// matches exactly either side of it.
const SEAM_OVERLAP = 1;

// A mirrored 2x2 block of the photo, baked once into an offscreen canvas and handed to
// createPattern. The owner wasn't sure their photo tiles seamlessly; a mirrored copy of an
// edge always matches itself, so the tile has no seam regardless.
export function buildGrassPattern(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
): CanvasPattern | null {
  const w = GRASS_TILE_W;
  const h = GRASS_TILE_H;
  const tile = document.createElement("canvas");
  tile.width = w * 2;
  tile.height = h * 2;
  const t = tile.getContext("2d");
  if (!t) return null;
  const quadrants: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [w * 2, 0, -1, 1],
    [0, h * 2, 1, -1],
    [w * 2, h * 2, -1, -1],
  ];
  for (const [tx, ty, sx, sy] of quadrants) {
    t.save();
    t.translate(tx, ty);
    t.scale(sx, sy);
    t.drawImage(image, -SEAM_OVERLAP, -SEAM_OVERLAP, w + SEAM_OVERLAP * 2, h + SEAM_OVERLAP * 2);
    t.restore();
  }
  return ctx.createPattern(tile, "repeat");
}

// Road grain — a handful of fixed, hand-placed flecks over the flat asphalt fill (owner
// ask: "a little road like texture would be amazing"), not an image and not a filter.
const ROAD_TILE = 22;
const ROAD_FLECKS: [number, number, number, string][] = [
  [4, 6, 1.3, "rgba(255,255,255,0.07)"],
  [14, 3, 0.9, "rgba(0,0,0,0.09)"],
  [19, 10, 1.5, "rgba(255,255,255,0.07)"],
  [8, 14, 1, "rgba(0,0,0,0.09)"],
  [2, 19, 1.2, "rgba(255,255,255,0.07)"],
  [16, 18, 0.9, "rgba(0,0,0,0.09)"],
];

export function buildRoadPattern(
  ctx: CanvasRenderingContext2D,
  baseColor: string,
): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = ROAD_TILE;
  tile.height = ROAD_TILE;
  const t = tile.getContext("2d");
  if (!t) return null;
  t.fillStyle = baseColor;
  t.fillRect(0, 0, ROAD_TILE, ROAD_TILE);
  for (const [x, y, r, color] of ROAD_FLECKS) {
    t.fillStyle = color;
    t.beginPath();
    t.arc(x, y, r, 0, Math.PI * 2);
    t.fill();
  }
  return ctx.createPattern(tile, "repeat");
}

// The road's inner edge trim — a light, tiled strip stood in for a pathway/curb border
// (owner ask, 2026-08-24). Same fleck-tile technique as buildRoadPattern, smaller tile
// (it's a stroke, not a field fill) and dark flecks on a light base — the inverse of the
// dark-road/light-fleck pairing above.
const ROAD_EDGE_TILE = 6;
const ROAD_EDGE_FLECKS: [number, number, number, string][] = [
  [1, 1, 0.5, "rgba(0,0,0,0.12)"],
  [4, 2, 0.4, "rgba(0,0,0,0.08)"],
  [2, 4, 0.4, "rgba(0,0,0,0.08)"],
];

export function buildRoadEdgePattern(
  ctx: CanvasRenderingContext2D,
  baseColor: string,
): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = ROAD_EDGE_TILE;
  tile.height = ROAD_EDGE_TILE;
  const t = tile.getContext("2d");
  if (!t) return null;
  t.fillStyle = baseColor;
  t.fillRect(0, 0, ROAD_EDGE_TILE, ROAD_EDGE_TILE);
  for (const [x, y, r, color] of ROAD_EDGE_FLECKS) {
    t.fillStyle = color;
    t.beginPath();
    t.arc(x, y, r, 0, Math.PI * 2);
    t.fill();
  }
  return ctx.createPattern(tile, "repeat");
}
