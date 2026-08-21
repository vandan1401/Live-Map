// Applies each plot-number label's real orientation and size, exactly as the CAD
// operator set them in the source DXF (docs/plans/17.md, 2026-08-21) -- read off
// data-rotation/data-label-height, which pipeline/export/svg.py bakes in from the
// label's own DXF entity, converted into SVG-space there. This replaces an earlier
// version of this file that guessed orientation from the plot's own polygon geometry;
// the operator had already rotated/sized every real label to fit its plot, so a guess
// was both unnecessary and occasionally wrong (found live: a rotating-calipers "shorter
// edge" pick doesn't always match how a human actually oriented the text).
//
// Both attributes are optional -- fixtures/shree-vatika-2/colony.svg predates this
// (hand-authored, no source DXF to extract from) and has neither, so every label there
// renders exactly as before: upright, at the shared CSS default size (plot-selection.css).
export function alignPlotLabels(svgEl: SVGSVGElement): void {
  for (const el of svgEl.querySelectorAll(".plot-label")) {
    const rotation = el.getAttribute("data-rotation");
    const height = el.getAttribute("data-label-height");
    const x = el.getAttribute("x");
    const y = el.getAttribute("y");
    if (rotation !== null && x !== null && y !== null) {
      el.setAttribute("transform", `rotate(${rotation} ${x} ${y})`);
    }
    if (height !== null && el instanceof SVGElement) {
      el.style.fontSize = `${height}px`;
    }
  }
}
