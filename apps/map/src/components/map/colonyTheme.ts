// D-004's enforcement point. Every colour the canvas renderer paints is read from the CSS
// custom properties in styles/colony-theme.css at runtime — never written as a literal in
// a draw call. That is what keeps "change one variable, every colony changes" true now
// that the map is no longer styled by CSS selectors.
//
// docs/plans/18.md acceptance criterion 6 greps apps/map/src for the status hexes and
// fails if any live outside colony-theme.css. MISSING below is deliberately not one of
// them: an unresolved variable renders shocking magenta so a broken theme is obvious in
// one glance, rather than a plausible-looking grey nobody notices.
const MISSING = "#ff00ff";

export interface ColonyTheme {
  groundBase: string;
  road: string;
  amenity: string;
  amenityAccent: string;
  water: string;
  gardenTint: string;
  gardenBase: string;
  gardenBlobLight: string;
  plotBase: string;
  siteBoundary: string;
  plotStroke: string;
  plotStrokeWidth: number;
  selectedStroke: string;
  status: Record<string, string>;
  featureLabelInk: string;
  plotLabelInk: string;
}

// The bold geometric sans the owner's map-render reference uses for plot numbers, road
// names and feature labels (2026-08-22) — loaded from Google Fonts in index.html. The
// system-font stack is the fallback for the one frame before it loads and for any
// environment that blocks the font request.
export const MAP_FONT_FAMILY = "'Poppins', ui-sans-serif, system-ui, sans-serif";

function read(style: CSSStyleDeclaration, name: string): string {
  const value = style.getPropertyValue(name).trim();
  return value === "" ? MISSING : value;
}

export function resolveColonyTheme(root: Element = document.documentElement): ColonyTheme {
  const s = getComputedStyle(root);
  const strokeWidth = Number(s.getPropertyValue("--colony-plot-stroke-width").trim());
  return {
    groundBase: read(s, "--colony-ground-base"),
    road: read(s, "--colony-road"),
    amenity: read(s, "--colony-amenity"),
    amenityAccent: read(s, "--colony-amenity-accent"),
    water: read(s, "--colony-water"),
    gardenTint: read(s, "--colony-garden-tint"),
    gardenBase: read(s, "--colony-garden-base"),
    gardenBlobLight: read(s, "--colony-garden-blob-light"),
    plotBase: read(s, "--colony-plot-base"),
    siteBoundary: read(s, "--colony-site-boundary"),
    plotStroke: read(s, "--colony-plot-stroke"),
    // 0.5 user units (docs/plans/18.md §3) — dropped from 1.5 once Jai Dev's small real
    // plots made the old width look heavy. NaN here means the variable is missing, and
    // falling back to 0 would silently erase every plot boundary on the map.
    plotStrokeWidth: Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 0.5,
    selectedStroke: read(s, "--colony-plot-selected-stroke"),
    status: {
      available: read(s, "--colony-status-available"),
      booked: read(s, "--colony-status-booked"),
      registered: read(s, "--colony-status-registered"),
    },
    featureLabelInk: read(s, "--colony-feature-label-ink"),
    plotLabelInk: read(s, "--colony-plot-label-ink"),
  };
}
