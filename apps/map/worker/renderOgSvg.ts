import { STATUS_FILL_ALPHA } from "../src/components/map/statusFillAlpha.ts";
import { resolveOgTheme } from "./theme.ts";

export interface OgPlot {
  svg_id: string;
  status: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const num = Number.parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Same maths as drawColony.ts's `ctx.globalAlpha = STATUS_FILL_ALPHA; ctx.fillStyle =
// color` over an opaque plotBase — resvg has no compositing pass to reproduce that with,
// so the two flat fills are pre-mixed into one here instead.
function blend(baseHex: string, tintHex: string, alpha: number): string {
  const [br, bg, bb] = hexToRgb(baseHex);
  const [tr, tg, tb] = hexToRgb(tintHex);
  const mix = (b: number, t: number) => Math.round(b * (1 - alpha) + t * alpha);
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(mix(br, tr))}${toHex(mix(bg, tg))}${toHex(mix(bb, tb))}`;
}

// Builds a standalone, rasterizable SVG document for the WhatsApp/social preview image:
// the same class vocabulary drawColony.ts paints onto a live <canvas> frame by frame
// (D-004), reproduced once as CSS class rules instead, since resvg rasterizes a document,
// it doesn't run a paint loop. Deliberately simplified vs. the real map (owner ask,
// 2026-09-14): no ground texture, no garden tree-scatter, no plot/feature labels, no
// dimension lines — just the plan shape, legible at a WhatsApp thumbnail's size. `plots`
// carries a `status` per svg_id, but the caller (publicShare.ts's servePreviewImage) has
// already forced every one of them through applyStatusVisibility(..., false) before this
// ever runs — this function paints whatever status string it's handed, it does not itself
// decide whether real status is safe to show.
export function renderOgSvg(rawSvg: string, plots: readonly OgPlot[]): string {
  const theme = resolveOgTheme();

  const statusRules = Object.entries(theme.status)
    .map(([status, color]) => `.plot[data-status="${status}"]{fill:${blend(theme.plotBase, color, STATUS_FILL_ALPHA)}}`)
    .join("");

  const style = `
    .site-boundary{fill:none;stroke:${theme.siteBoundary};stroke-width:2}
    .road{fill:${theme.road};stroke:${theme.roadEdge};stroke-width:4}
    .garden{fill:${theme.gardenBase}}
    .water{fill:${theme.water}}
    .amenity{fill:${theme.amenity}}
    .amenity[data-kind="clubhouse"],.amenity[data-kind="playground"]{fill:${theme.amenityAccent}}
    .plot{fill:${theme.plotBase};stroke:${theme.plotStroke};stroke-width:${theme.plotStrokeWidth}}
    ${statusRules}
    .feature-label,.plot-label{display:none}
  `;

  const openTag = /^<svg[^>]*>/.exec(rawSvg);
  if (!openTag) throw new Error("colony svg is missing its <svg> root element");
  let svg = rawSvg.slice(0, openTag[0].length) + `<style>${style}</style>` + rawSvg.slice(openTag[0].length);

  for (const plot of plots) {
    // svg_id comes from get_public_colony(), scoped to one colony_id — (colony_id,
    // svg_id) is unique (tier-1.md's Concurrency section), so this can only ever touch
    // the one matching plot path.
    svg = svg.replace(`id="${plot.svg_id}"`, `id="${plot.svg_id}" data-status="${plot.status}"`);
  }

  return svg;
}
