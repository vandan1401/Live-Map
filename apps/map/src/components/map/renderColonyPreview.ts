import { parseColonyModel } from "./colonyModel.ts";
import { resolveColonyTheme } from "./colonyTheme.ts";
import { buildGrassPattern, buildRoadEdgePattern, buildRoadPattern } from "./canvasPatterns.ts";
import { drawColony } from "./drawColony.ts";
import { fitView } from "./view.ts";
import grassPhotoUrl from "../../assets/textures/grass-satellite.jpg";

// A still, non-interactive render of a colony, used by the upload screen's confirmation
// (D-025). It shares parseColonyModel, resolveColonyTheme, the patterns and drawColony
// with the live map — deliberately, and this is the load-bearing part: that confirmation
// is the only code path in the app that writes `verified: true` (invariant 2), so a
// preview drawn by different code would be a gate on an artefact the map never produces.
//
// No Leaflet, no gestures, no sync. It draws once at fit scale and returns a teardown.

export function renderColonyPreview(container: HTMLElement, svg: string): () => void {
  const model = parseColonyModel(svg);
  const theme = resolveColonyTheme();

  const canvas = document.createElement("canvas");
  canvas.className = "colony-preview-canvas";
  container.appendChild(canvas);

  let cancelled = false;

  const paint = (grassImage: HTMLImageElement | null) => {
    if (cancelled || !container.isConnected) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    // The upload preview box is width-driven; keep the colony's own aspect ratio rather
    // than letterboxing it into whatever height the panel happens to have.
    const height = Math.max(1, Math.round((width * model.height) / model.width));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    // jsdom has no canvas backend; the upload tests assert on parse/validation messages,
    // not pixels, so a missing context is skipped rather than thrown.
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const viewport = { width, height };
    // Every plot renders in its available colour: the manifest being verified has no
    // statuses yet, and showing them all as "unknown" would make the human confirm a map
    // that looks nothing like the one they will get.
    const statuses: Record<string, string> = {};
    for (const plot of model.plots) statuses[plot.id] = "available";

    drawColony(ctx, model, fitView(model, viewport), viewport, theme, {
      statuses,
      selectedId: null,
      activeStatuses: new Set<string>(),
      showPlotLabels: true,
      grass: grassImage ? buildGrassPattern(ctx, grassImage) : null,
      road: buildRoadPattern(ctx, theme.road),
      roadEdge: buildRoadEdgePattern(ctx, theme.roadEdge),
      transitions: new Map(),
      dimensions: null,
      // is_corner lives on the `plots` table row, which does not exist yet at this stage
      // (D-025's preview runs before import) — treated as "no corner plots" rather than
      // blocking the preview on data that cannot exist yet.
      cornerPlots: new Set<string>(),
    });
  };

  const img = new Image();
  img.onload = () => paint(img);
  img.onerror = () => paint(null);
  img.src = grassPhotoUrl;
  // Paint immediately too, so the preview is never blank while the texture decodes.
  paint(null);

  return () => {
    cancelled = true;
    canvas.remove();
  };
}
