import { buildDimensionArrowMarker } from "./plotDimensionOverlay.ts";
import { buildGardenPatternDefs, buildRoadPatternDefs } from "./mapTexturePatterns.ts";
import grassPhotoUrl from "../assets/textures/grass-satellite.jpg";

// Split out of ColonyMap.tsx (docs/plans/11.md /review finding — a component file may
// only export components, or Fast Refresh breaks) so both ColonyMap.tsx and
// ColonyUploadScreen.tsx's preview render the same decorated SVG (garden/road pattern
// defs, dimension-arrow marker) — the upload confirmation must match what the map itself
// shows, or the verification gate D-025 exists for is effectively blank (no fill for
// roads/gardens).
export function parseColonySvg(raw: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  svg.classList.add("colony-svg-root");
  svg.appendChild(buildDimensionArrowMarker());
  // Only .garden (fill: url(#texture-garden)) reads from this — the ground itself comes
  // from ColonyMap.tsx's separate world-ground layer, not a rect painted inside this SVG,
  // so the same one photo texture shows through consistently both inside and outside the
  // site's own boundary with no seam or phase mismatch between two separately-tiled
  // patterns.
  svg.appendChild(buildGardenPatternDefs(grassPhotoUrl));
  svg.appendChild(buildRoadPatternDefs()); // only ever referenced by .road, this doc only
  return svg;
}
