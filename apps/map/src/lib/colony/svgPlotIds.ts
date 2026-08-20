// Extracts every plot id from raw SVG markup — shared by scripts/import-seed.ts and the
// colony-upload manifest parser (docs/plans/11.md) so the identity check ("does the
// manifest's plot list agree with what the SVG actually contains") can never drift between
// the two call sites.
export function extractSvgPlotIds(svgRaw: string): Set<string> {
  return new Set(
    [...svgRaw.matchAll(/id="(plot-(?:[A-Z]+-)?\d+)"/g)].map((m) => m[1]),
  );
}
