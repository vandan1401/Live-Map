import { minAreaRect, polygonCentroid, simplifyNearCollinear, type Point } from "../../lib/colony/plotGeometry.ts";
import type { ColonyTheme } from "./colonyTheme.ts";

// The selected plot's dimension callout, ported from the deleted plotDimensionOverlay.ts
// (docs/plans/18.md). The maths is unchanged — only the output moved from createElementNS
// to draw calls. Both 180-degree ambiguities it resolves were found live against real plot
// geometry on 2026-08-21, not against a synthetic rectangle, so neither is theoretical.

// Owner ask, 2026-08-21: pulled in from 14 to sit right against the plot, now that the
// line carries no arrowheads to clear.
const DIMENSION_OFFSET = 1;
// The label sits its own small gap beyond the line, further from the plot, so the line can
// stay only DIMENSION_OFFSET away without the text overlapping it.
const TEXT_GAP = 2.0;
const LABEL_SIZE = 3;
const LINE_WIDTH = 0.4;
const DASH: [number, number] = [1.5, 1.5];
const LINE_ALPHA = 0.7;

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// One edge's line + label, offset outward along an angle the caller already resolved
// against the plot's own centroid — this trusts it rather than re-deriving a direction
// from the edge alone, which is ambiguous.
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edgeMid: Point,
  edgeAngle: number,
  outwardAngle: number,
  span: number,
  label: string,
  theme: ColonyTheme,
): void {
  const lineX = edgeMid[0] + Math.cos(outwardAngle) * DIMENSION_OFFSET;
  const lineY = edgeMid[1] + Math.sin(outwardAngle) * DIMENSION_OFFSET;
  const dx = (Math.cos(edgeAngle) * span) / 2;
  const dy = (Math.sin(edgeAngle) * span) / 2;

  ctx.save();
  ctx.globalAlpha = LINE_ALPHA;
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = LINE_WIDTH;
  ctx.setLineDash([DASH[0], DASH[1]]);
  ctx.beginPath();
  ctx.moveTo(lineX - dx, lineY - dy);
  ctx.lineTo(lineX + dx, lineY + dy);
  ctx.stroke();
  ctx.restore();

  // Keep the label upright whichever way the edge vector points. This flip and the
  // caller's outwardAngle flip are two INDEPENDENT resolutions of the same 180-degree
  // ambiguity: they agree on some edges and disagree on others. Centring the glyph on its
  // anchor is what makes the disagreement harmless — it removes any dependence on which
  // way a baseline extends, so this flip only has to solve readability, never position.
  let deg = (edgeAngle * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;

  const textX = edgeMid[0] + Math.cos(outwardAngle) * (DIMENSION_OFFSET + TEXT_GAP);
  const textY = edgeMid[1] + Math.sin(outwardAngle) * (DIMENSION_OFFSET + TEXT_GAP);

  ctx.save();
  ctx.translate(textX, textY);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.fillStyle = theme.selectedStroke;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${LABEL_SIZE}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

// One line per real edge (4 for a common rectangular plot, 5 for a subdivided one), not
// two abstracted length/breadth lines — owner ask, 2026-08-21: "show all 4 dimensions of a
// plot". Edge lengths are measured off the geometry and converted using a scale derived
// from this plot's own stored lengthFt/breadthFt, so no separate px_per_ft fetch is
// needed. Every label rounds to 0.5 ft so all four read as consistent numbers rather than
// mixing one exact pipeline value with three derived estimates.
export function drawPlotDimensions(
  ctx: CanvasRenderingContext2D,
  rawPoints: Point[],
  lengthFt: number,
  breadthFt: number,
  theme: ColonyTheme,
): void {
  if (rawPoints.length < 3) return; // degenerate ring; nothing sane to draw
  const points = simplifyNearCollinear(rawPoints);

  const rect = minAreaRect(points);
  const shorterSpanUnits = Math.min(rect.edgeLen, rect.perpLen);
  const longerSpanUnits = Math.max(rect.edgeLen, rect.perpLen);
  // Averaged from both known sides: a real plot ring is not a perfect rectangle, so the
  // two independent estimates rarely agree exactly, and splitting the difference is more
  // robust than arbitrarily picking one. This is a rendering estimate derived from stored
  // values — it never recomputes anything the manifest already carries.
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
    // plot's centroid. Found live, 2026-08-21 — a fixed +90 degree choice sat inside the
    // plot, crowding a neighbour, for roughly half of any given plot's edges.
    const perp = edgeAngle + Math.PI / 2;
    const testPoint: Point = [edgeMid[0] + Math.cos(perp), edgeMid[1] + Math.sin(perp)];
    const outward = Math.hypot(testPoint[0] - centroid[0], testPoint[1] - centroid[1]);
    const inward = Math.hypot(edgeMid[0] - centroid[0], edgeMid[1] - centroid[1]);
    const outwardAngle = outward > inward ? perp : perp + Math.PI;

    const ft = roundToHalf(edgeLenUnits * ftPerUnit);
    drawEdge(ctx, edgeMid, edgeAngle, outwardAngle, edgeLenUnits, `${ft} ft`, theme);
  }
}
