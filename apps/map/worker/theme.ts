import colonyThemeCss from "../src/styles/colony-theme.css";

// D-004's Worker-side counterpart to colonyTheme.ts's resolveColonyTheme(): every colour
// still comes from exactly one file, colony-theme.css — this just reads its `--colony-*`
// custom properties as text instead of via getComputedStyle, since a Worker has no DOM to
// compute styles against. Narrowed to only the tokens the OG preview actually paints
// (renderOgSvg.ts) — no labels, no ground texture, no garden decoration, no dimension
// lines (owner ask, 2026-09-14).
export interface OgTheme {
  groundBase: string;
  road: string;
  roadEdge: string;
  amenity: string;
  amenityAccent: string;
  water: string;
  gardenBase: string;
  plotBase: string;
  siteBoundary: string;
  plotStroke: string;
  plotStrokeWidth: number;
  status: Record<string, string>;
}

// A variable missing from colony-theme.css is a bug in this list, not something to paper
// over with a fallback colour the way colonyTheme.ts's MISSING/magenta does for a live,
// visibly-broken page — an OG image render has no viewer watching for magenta, so it fails
// loudly at request time instead (colonyTheme.test.ts-equivalent coverage is
// worker/theme.test.ts).
function readVar(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(colonyThemeCss);
  if (!match) throw new Error(`colony-theme.css is missing ${name}`);
  return match[1].trim();
}

let cached: OgTheme | null = null;

export function resolveOgTheme(): OgTheme {
  if (cached) return cached;
  cached = {
    groundBase: readVar("--colony-ground-base"),
    road: readVar("--colony-road"),
    roadEdge: readVar("--colony-road-edge"),
    amenity: readVar("--colony-amenity"),
    amenityAccent: readVar("--colony-amenity-accent"),
    water: readVar("--colony-water"),
    gardenBase: readVar("--colony-garden-base"),
    plotBase: readVar("--colony-plot-base"),
    siteBoundary: readVar("--colony-site-boundary"),
    plotStroke: readVar("--colony-plot-stroke"),
    plotStrokeWidth: Number(readVar("--colony-plot-stroke-width")),
    status: {
      available: readVar("--colony-status-available"),
      booked: readVar("--colony-status-booked"),
      registered: readVar("--colony-status-registered"),
    },
  };
  return cached;
}
