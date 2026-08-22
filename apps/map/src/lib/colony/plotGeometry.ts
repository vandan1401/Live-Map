// Pure geometry on a plot's own polygon vertices -- no DOM, matching this directory's
// DOM-free convention (NAVIGATION.md). Shared by components/plotDimensionOverlay.ts
// (the dimension callout) and useColonyMapMount.ts (rotating each plot-number label to
// match its own plot's orientation) -- split out here, 2026-08-21, so both read the
// plot's true angle the same way rather than reimplementing it twice.
export type Point = [number, number];

// Reads a `.plot` <path>'s own `d` attribute back into vertices.
//
// Two producers, two grammars, and this has to read both. `tools/pipeline`'s exporter
// emits `M x,y L x,y ... Z` -- straight segments, no curves, no holes. The shared
// fixture `fixtures/shree-vatika-2/colony.svg` is hand-authored and instead uses
// `M x y H x V y H x Z` -- horizontal/vertical shorthand, space-separated. An earlier
// version of this function matched only the pipeline's form, so it returned an EMPTY
// array for every plot in the fixture (found 2026-08-22 while building the canvas
// picker, docs/plans/18.md). Nothing failed loudly: the dimension callout's
// `rawPoints.length < 3` guard just drew nothing, on the one colony every test uses.
//
// Absolute commands only -- neither producer emits relative ones for a plot ring. An
// unrecognised command has its numeric arguments skipped rather than misread as
// coordinates; that keeps a curve in some future hand-drawn plot from silently
// inventing vertices, at the cost of a slightly coarse ring.
export function parsePlotPoints(d: string): Point[] {
  const points: Point[] = [];
  let cx = 0;
  let cy = 0;
  // One token per command letter, each followed by its own numbers.
  for (const m of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const cmd = m[1].toUpperCase();
    const nums = (m[2].match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);
    if (cmd === "M" || cmd === "L") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        cx = nums[i];
        cy = nums[i + 1];
        points.push([cx, cy]);
      }
    } else if (cmd === "H") {
      for (const x of nums) {
        cx = x;
        points.push([cx, cy]);
      }
    } else if (cmd === "V") {
      for (const y of nums) {
        cy = y;
        points.push([cx, cy]);
      }
    }
    // Z closes the ring -- the closing vertex is already points[0], so pushing it again
    // would give every ring a duplicate point and a zero-length final edge. Any other
    // command: numbers deliberately dropped (see above).
  }
  return points;
}

// Drops any vertex that sits (nearly) on the straight line between its two neighbours --
// a 5-point ring where one "corner" is really just a jittered midpoint of an otherwise
// straight edge (DXF export precision, or a duplicate-ish point simplify() left behind)
// reads as a genuine 4-sided plot with an accidental 5th sliver edge otherwise (owner
// ask, 2026-08-21). toleranceUnits is the point's perpendicular distance from that
// straight line, in the same SVG viewBox units as the points themselves -- 0.5 is small
// next to this colony's ~9-95 unit plot sides, comfortably below any deliberate corner
// cut, but well above ordinary export jitter.
export function simplifyNearCollinear(points: Point[], toleranceUnits = 0.5): Point[] {
  if (points.length <= 3) return points;
  let result = points;
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const n = result.length;
      const prev = result[(i - 1 + n) % n];
      const curr = result[i];
      const next = result[(i + 1) % n];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const lenSq = dx * dx + dy * dy;
      const dist =
        lenSq === 0
          ? 0
          : Math.abs(dx * (prev[1] - curr[1]) - (prev[0] - curr[0]) * dy) / Math.sqrt(lenSq);
      if (dist < toleranceUnits) {
        result = result.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return result;
}

// Plain average of vertices -- not the true area centroid, but this is only ever used
// to tell "which side of the edge is outward" apart, and that only needs to be roughly
// inside the polygon, which the vertex average always is for the small, close-to-convex
// quads/pentagons a real plot ring produces.
export function polygonCentroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Standard monotone-chain convex hull. Real plot rings are already convex in the
// overwhelming majority of cases (rectangles, occasional trapezoids from a road-facing
// cutout) -- this is a cheap safety net for the rare concave one, not load-bearing.
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export interface RoundedCorner {
  p1: Point; // point on the incoming edge, `radius` back from the corner
  corner: Point; // the true polygon vertex
  p2: Point; // point on the outgoing edge, `radius` forward from the corner
  radius: number; // clamped to half the shorter adjacent edge, never the caller's raw ask
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// Moves `radius` units from `from` toward `to`. Degenerates to `from` itself (radius 0)
// on a zero-length edge rather than dividing by zero.
function pointToward(from: Point, to: Point, radius: number): Point {
  const d = dist(from, to);
  if (d === 0) return from;
  const t = radius / d;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

// One rounded-corner spec per vertex, for the draw layer to turn into
// moveTo/lineTo/arcTo calls (Path2D can't be built here — this module runs under jsdom,
// which has neither Path2D nor getBBox, matching this directory's DOM-free convention).
// `maxRadius` is clamped per-corner to half of each adjacent edge, so a tiny plot corner
// never rounds past its own neighbour's corner (owner reference, 2026-08-22).
export function roundedPolygonCorners(points: Point[], maxRadius: number): RoundedCorner[] {
  const n = points.length;
  if (n < 3) return [];
  const corners: RoundedCorner[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const radius = Math.min(maxRadius, dist(prev, curr) / 2, dist(curr, next) / 2);
    corners.push({
      p1: pointToward(curr, prev, radius),
      corner: curr,
      p2: pointToward(curr, next, radius),
      radius,
    });
  }
  return corners;
}

export interface MinRect {
  angleRad: number; // direction of one pair of sides
  center: Point;
  edgeLen: number; // extent along angleRad
  perpLen: number; // extent along angleRad + 90deg
}

// Rotating-calipers minimum-area bounding rectangle. Real colonies are not laid out on
// a grid (found on Jai Dev Residency, 2026-08-21: plots follow angled roads, not N/S-E/W
// axes) -- this measures a plot's true orientation instead of assuming one.
export function minAreaRect(points: Point[]): MinRect {
  const hull = convexHull(points);
  if (hull.length < 3) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      angleRad: 0,
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      edgeLen: maxX - minX,
      perpLen: maxY - minY,
    };
  }

  let best: MinRect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hull.length; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % hull.length];
    const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (const [x, y] of hull) {
      const u = x * cos - y * sin;
      const v = x * sin + y * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const cosBack = Math.cos(angle);
      const sinBack = Math.sin(angle);
      best = {
        angleRad: angle,
        center: [cu * cosBack - cv * sinBack, cu * sinBack + cv * cosBack],
        edgeLen: maxU - minU,
        perpLen: maxV - minV,
      };
    }
  }
  return best as MinRect;
}

