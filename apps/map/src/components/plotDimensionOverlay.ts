// SVG-building helpers for the selected plot's dimension callout: a thin, light, dashed
// line and label for every side of the plot (owner ask, 2026-08-21 — "show all 4
// dimensions of a plot", not just an abstracted length/breadth pair), each drawn along
// its own real edge and offset outward from THAT edge specifically (not a shared
// center), so a west-facing edge gets the same clearance as any other side instead of
// occasionally crowding a neighbour. Pulled out of ColonyMap.tsx to keep that file under
// the 250-line cap (CLAUDE.md invariant 7) — this is presentation glue, not domain
// logic, so it stays with the other DOM-writing map code; the pure geometry it uses
// lives in lib/colony/plotGeometry.ts.
import { minAreaRect, polygonCentroid, simplifyNearCollinear, type Point } from "../lib/colony/plotGeometry.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
// Gap (SVG viewBox units) between the plot's edge and its dimension line -- owner ask,
// 2026-08-21: pulled way in from 14 to sit right up against the plot now that the line
// carries no arrowheads to clear.
const DIMENSION_OFFSET = 1;
// The label sits its own small gap beyond the line (further from the plot, same
// direction), not centred on top of it -- this is what lets the line itself sit only
// DIMENSION_OFFSET away from the plot without the label overlapping it. With
// dominant-baseline "central" the glyph extends ~half its font-size on BOTH sides of
// its anchor, so this gap has to clear the line's own offset too, not just the plot
// edge -- 2.0 leaves the glyph's near edge (offset + gap - ~half of the 3px font) a
// clean margin past DIMENSION_OFFSET's line, not overlapping it.
const TEXT_GAP = 2.0;

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// One edge's dimension line + label, offset outward along `outwardAngle` (already
// resolved against the plot's own centroid by the caller -- this function trusts it
// rather than re-deriving a direction from the edge alone, which is ambiguous).
function buildEdgeDimension(edgeMid: Point, edgeAngle: number, outwardAngle: number, span: number, label: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "plot-dim");

  const lineX = edgeMid[0] + Math.cos(outwardAngle) * DIMENSION_OFFSET;
  const lineY = edgeMid[1] + Math.sin(outwardAngle) * DIMENSION_OFFSET;
  const dx = (Math.cos(edgeAngle) * span) / 2;
  const dy = (Math.sin(edgeAngle) * span) / 2;

  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "plot-dim-line");
  line.setAttribute("x1", String(lineX - dx));
  line.setAttribute("y1", String(lineY - dy));
  line.setAttribute("x2", String(lineX + dx));
  line.setAttribute("y2", String(lineY + dy));
  g.appendChild(line);

  // Keep the label upright regardless of which way the edge vector points -- flip 180deg
  // whenever the raw angle would otherwise render the text bottom-up. This flip and
  // outwardAngle's own flip (in the caller) are two INDEPENDENT 180deg-ambiguity
  // resolutions -- found live, 2026-08-21 (real plot geometry, not a synthetic
  // rectangle): they agree on some edges and disagree on others, and disagreeing means
  // the glyph's natural baseline-relative extension points back toward the plot instead
  // of away from it. Fixed below by centring the glyph on its anchor (dominant-baseline
  // "central") instead of relying on which way an alphabetic baseline happens to
  // extend -- that makes extension direction irrelevant, so this flip only has to solve
  // readability, never position.
  let deg = (edgeAngle * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;

  const textX = edgeMid[0] + Math.cos(outwardAngle) * (DIMENSION_OFFSET + TEXT_GAP);
  const textY = edgeMid[1] + Math.sin(outwardAngle) * (DIMENSION_OFFSET + TEXT_GAP);

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("class", "plot-dim-label");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute("x", String(textX));
  text.setAttribute("y", String(textY));
  text.setAttribute("transform", `rotate(${deg} ${textX} ${textY})`);
  text.textContent = label;
  g.appendChild(text);

  return g;
}

// `points` are the selected plot's own polygon vertices (parsePlotPoints on its <path
// d="...">). Draws one dimension line per real edge (4 for the common rectangular plot,
// 5 for a subdivided/cutout one) rather than two abstracted length/breadth lines.
//
// Real edge lengths are measured directly off the geometry, in SVG viewBox units, then
// converted to feet using a scale derived from this plot's own known lengthFt against
// its measured shorter span (tools/pipeline/pipeline/export/manifest.py's
// _rect_sides_ft convention: lengthFt is always the shorter side) -- self-contained, no
// separate fetch of the colony's px_per_ft needed. Every label is rounded to the
// nearest 0.5 ft (owner ask, 2026-08-21) so all 4 read as clean, consistent numbers
// rather than mixing an exact pipeline value with three derived estimates.
export function buildDimensionGroup(rawPoints: Point[], lengthFt: number, breadthFt: number): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "plot-dimensions");
  if (rawPoints.length < 3) return group; // degenerate ring; nothing sane to draw
  const points = simplifyNearCollinear(rawPoints);

  const rect = minAreaRect(points);
  const shorterSpanUnits = Math.min(rect.edgeLen, rect.perpLen);
  const longerSpanUnits = Math.max(rect.edgeLen, rect.perpLen);
  // Averaged from both known sides rather than derived from lengthFt alone -- a real
  // plot ring isn't a perfect rectangle, so the two independent estimates rarely agree
  // exactly; splitting the difference is more robust than picking one arbitrarily.
  const fromLength = shorterSpanUnits > 0 ? lengthFt / shorterSpanUnits : 0;
  const fromBreadth = longerSpanUnits > 0 ? breadthFt / longerSpanUnits : 0;
  const ftPerUnit = fromBreadth > 0 ? (fromLength + fromBreadth) / 2 : fromLength;

  const centroid = polygonCentroid(points);
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const edgeAngle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const edgeLenUnits = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const edgeMid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    // Outward normal: perpendicular to the edge, on whichever side is farther from the
    // plot's own centroid -- found live, 2026-08-21: a fixed +90deg choice sat inside
    // the plot (crowding a neighbour) for roughly half of any given plot's edges.
    const perp = edgeAngle + Math.PI / 2;
    const testPoint: Point = [edgeMid[0] + Math.cos(perp), edgeMid[1] + Math.sin(perp)];
    const outward = Math.hypot(testPoint[0] - centroid[0], testPoint[1] - centroid[1]);
    const inward = Math.hypot(edgeMid[0] - centroid[0], edgeMid[1] - centroid[1]);
    const outwardAngle = outward > inward ? perp : perp + Math.PI;

    const ft = roundToHalf(edgeLenUnits * ftPerUnit);
    group.appendChild(buildEdgeDimension(edgeMid, edgeAngle, outwardAngle, edgeLenUnits, `${ft} ft`));
  }
  return group;
}
