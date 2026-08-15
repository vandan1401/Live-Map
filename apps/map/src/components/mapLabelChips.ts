// White pill background behind road/quadrant name labels (owner reference render,
// 2026-08-15: "Rua SD-2247-145" and "Q-F" style labels sit on small white chips, not
// directly on the road) — feature labels only, plot numbers stay bare per the same
// reference. Built once, after the site SVG is attached to the DOM: getBBox() needs
// layout, which only exists once Leaflet's svgOverlay has actually inserted the node.
const SVG_NS = "http://www.w3.org/2000/svg";

export function addFeatureLabelChips(svg: SVGSVGElement): void {
  const labels = svg.querySelectorAll<SVGTextElement>(".feature-label");
  const paddingX = 5;
  const paddingY = 3;
  for (const text of labels) {
    const bbox = text.getBBox();
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(bbox.x - paddingX));
    rect.setAttribute("y", String(bbox.y - paddingY));
    rect.setAttribute("width", String(bbox.width + paddingX * 2));
    rect.setAttribute("height", String(bbox.height + paddingY * 2));
    rect.setAttribute("rx", "3");
    rect.setAttribute("class", "feature-label-chip");
    // getBBox() returns the box in the text's own pre-transform coordinate space — road
    // labels rotate via a transform on the <text> itself, so the chip needs the identical
    // transform to rotate with it instead of sitting fixed while the text spins under it.
    const transform = text.getAttribute("transform");
    if (transform) rect.setAttribute("transform", transform);
    text.parentNode?.insertBefore(rect, text);
  }
}
