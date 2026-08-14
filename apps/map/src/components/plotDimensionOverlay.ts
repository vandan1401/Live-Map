// SVG-building helpers for the selected plot's length/breadth callout (architectural
// dimension lines with arrowheads at both ends, spec ask: "show the length and breadth
// as architectural arrows and text around the plot"). Pulled out of ColonyMap.tsx to
// keep that file under the 250-line cap (CLAUDE.md invariant 7) — this is presentation
// glue, not domain logic, so it stays with the other DOM-writing map code rather than
// lib/colony/ (which is DOM-free by design).
const SVG_NS = "http://www.w3.org/2000/svg";
// Gap (px, same units as the SVG viewBox) between the plot's edge and its dimension
// line — enough to clear the plot's own selected-state scale bump without the line
// crowding neighbouring plots on the demo fixture's spacing.
const DIMENSION_OFFSET = 14;

// One <marker> definition, referenced by both dimension lines drawn for whichever
// plot is currently selected. Built once when the SVG is first parsed (ColonyMap.tsx's
// parseColonySvg), not per-selection.
export function buildDimensionArrowMarker(): SVGDefsElement {
  const defs = document.createElementNS(SVG_NS, "defs");
  const marker = document.createElementNS(SVG_NS, "marker");
  marker.setAttribute("id", "plot-dim-arrow");
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "8");
  marker.setAttribute("refX", "4");
  marker.setAttribute("refY", "4");
  // Auto-flips so the same marker points outward at both ends of a line, on both the
  // horizontal (length) and vertical (breadth) callout.
  marker.setAttribute("orient", "auto-start-reverse");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M0,0 L8,4 L0,8 Z");
  path.setAttribute("class", "plot-dim-arrowhead");
  marker.appendChild(path);
  defs.appendChild(marker);
  return defs;
}

// Which side of the line the label sits on — needed once the line itself can flip
// to the opposite edge of the plot (see buildDimensionGroup).
type LabelSide = "above" | "below" | "left" | "right";

function buildDimensionLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  orientation: "horizontal" | "vertical",
  labelSide: LabelSide,
): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "plot-dim");

  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "plot-dim-line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("marker-start", "url(#plot-dim-arrow)");
  line.setAttribute("marker-end", "url(#plot-dim-arrow)");
  g.appendChild(line);

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("class", "plot-dim-label");
  text.setAttribute("text-anchor", "middle");
  if (orientation === "horizontal") {
    text.setAttribute("x", String((x1 + x2) / 2));
    text.setAttribute("y", String(labelSide === "above" ? y1 - 4 : y1 + 10));
  } else {
    const midX = labelSide === "left" ? x1 - 4 : x1 + 10;
    const midY = (y1 + y2) / 2;
    text.setAttribute("x", String(midX));
    text.setAttribute("y", String(midY));
    text.setAttribute("transform", `rotate(-90 ${midX} ${midY})`);
  }
  text.textContent = label;
  g.appendChild(text);

  return g;
}

// Room the offset line plus its text needs before the plot's own edge — below this,
// the line/label would land above y=0 or left of x=0 and clip out of the viewBox. +10,
// not +6: a text baseline at y=2 is still a positive, in-bounds coordinate, but a
// 6.5px label's own glyph ascent reaches above its baseline — the rendered shape
// clips even though the coordinate looks safe (/review follow-up, caught by checking
// the live DOM rather than trusting the coordinate math alone).
const LABEL_CLEARANCE = DIMENSION_OFFSET + 10;

// Length runs along the plot's top edge (horizontal), breadth along its left edge
// (vertical) — the fixture's plots are hand-authored, axis-aligned rectangles, so the
// bbox's width/height map directly onto them; this is a documented convention, not a
// measured one, matching how PlotDetailContent.tsx already lists Length before Breadth.
// Flips to the opposite edge when there's no room on the usual side (/review finding:
// plots flush against the top or left of the viewBox previously rendered their
// callout off-canvas, clipped, for exactly that reason).
export function buildDimensionGroup(
  bbox: DOMRect,
  lengthFt: number,
  breadthFt: number,
): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "plot-dimensions");

  const lengthAbove = bbox.y >= LABEL_CLEARANCE;
  const lengthY = lengthAbove ? bbox.y - DIMENSION_OFFSET : bbox.y + bbox.height + DIMENSION_OFFSET;
  group.appendChild(
    buildDimensionLine(
      bbox.x,
      lengthY,
      bbox.x + bbox.width,
      lengthY,
      `${lengthFt} ft`,
      "horizontal",
      lengthAbove ? "above" : "below",
    ),
  );

  const breadthLeft = bbox.x >= LABEL_CLEARANCE;
  const breadthX = breadthLeft ? bbox.x - DIMENSION_OFFSET : bbox.x + bbox.width + DIMENSION_OFFSET;
  group.appendChild(
    buildDimensionLine(
      breadthX,
      bbox.y,
      breadthX,
      bbox.y + bbox.height,
      `${breadthFt} ft`,
      "vertical",
      breadthLeft ? "left" : "right",
    ),
  );
  return group;
}
