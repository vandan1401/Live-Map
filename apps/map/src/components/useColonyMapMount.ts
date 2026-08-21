import { useEffect, type RefObject } from "react";
import L from "leaflet";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSync } from "../lib/sync/attachSync.ts";
import { buildWorldGroundSvg, computeWorldLayerBounds } from "./mapTexturePatterns.ts";
import { addFeatureLabelChips } from "./mapLabelChips.ts";
import { alignPlotLabels } from "./alignPlotLabels.ts";
import { parseColonySvg } from "./parseColonySvg.ts";
import grassPhotoUrl from "../assets/textures/grass-satellite.jpg";

// Margin below the fit-to-bounds zoom, not an absolute zoom level — a hardcoded absolute
// threshold (spec/06: "hide tree canopies and plot labels below a zoom threshold") went
// stale the moment the fixture's aspect ratio changed (/review finding: the M6 build
// measured "0" against a 1000x720 viewBox, and the M-Vatika-2 real-layout swap in that
// same session changed it to 1000x1390, silently moving the fit zoom below that fixed
// number). Deriving it from map.getBoundsZoom() each mount means it tracks whatever
// fixture is actually loaded.
const ZOOM_DETAIL_MARGIN = 0.3;

// Leaflet init, the world-ground layer, and attachSync's subscription — split out of
// ColonyMap.tsx (docs/plans/11.md, invariant 7's 250-line cap) the same way
// useSelectedPlotOverlay.ts already splits out selection styling. ColonyMap.tsx owns the
// refs and passes them in; this hook only ever writes into them and into the DOM.
export function useColonyMapMount(
  containerRef: RefObject<HTMLDivElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
  mapRef: RefObject<L.Map | null>,
  client: SupabaseClient,
  colonyId: string,
  colonySvg: string | null,
  setOffline: (offline: boolean) => void,
  setFreshnessLabel: (label: string) => void,
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !colonySvg) return;

    // CRS.Simple + a plain SVG overlay (D-009): Leaflet only ever manages pan and
    // zoom on the container. It never touches the plot paths, so nothing here can
    // write the inline styles that would beat colony-theme.css (D-004).
    const map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 4,
      zoomSnap: 0.1,
      attributionControl: false,
    });

    const svgEl = parseColonySvg(colonySvg);
    svgRef.current = svgEl;
    mapRef.current = map;

    // Built once so the bulk status callbacks below do a single tree walk (querySelectorAll)
    // instead of one svgEl.querySelector('#id') per plot — found laggy on Jai Dev
    // Residency's 675 plots (2026-08-21): 675 individual scoped-selector queries on mount
    // measurably slowed the initial paint, on top of the 675-simultaneous-transition issue
    // colony-theme.css's .no-transition rule addresses separately.
    const plotsById = new Map<string, Element>();
    for (const el of svgEl.querySelectorAll(".plot")) {
      if (el.id) plotsById.set(el.id, el);
    }
    alignPlotLabels(svgEl);
    // Read straight off the parsed SVG's own viewBox rather than a hand-maintained
    // constant — a stale copy here previously letterboxed a taller fixture into the
    // wrong bounds and threw off the selection auto-pan math (/review finding, M6).
    const { width: viewBoxWidth, height: viewBoxHeight } = svgEl.viewBox.baseVal;
    const siteBounds: L.LatLngBoundsExpression = [
      [0, 0],
      [viewBoxHeight, viewBoxWidth],
    ];

    // World-ground layer (owner correction, 2026-08-15: panning/zooming should feel
    // like the whole ground is moving, not just this rectangle) — a second, larger
    // svgOverlay added *before* the site's own, so it paints beneath it and shares this
    // same map's coordinate transform. See mapTexturePatterns.ts's computeWorldLayerBounds
    // and buildWorldGroundSvg for the sizing and why it's a separate SVG rather than
    // padding the site's own viewBox.
    const { worldWidth, worldHeight, worldBounds } = computeWorldLayerBounds(viewBoxWidth, viewBoxHeight);
    const worldSvg = buildWorldGroundSvg(grassPhotoUrl, worldWidth, worldHeight);
    worldSvg.classList.add("colony-world-ground");
    L.svgOverlay(worldSvg, worldBounds).addTo(map);

    L.svgOverlay(svgEl, siteBounds).addTo(map);
    // getBBox() right here still measures 0x0 — attached isn't the same as laid out, and
    // nothing forces that pass synchronously (found live: every chip pinned to (0, 0)).
    const labelChipFrame = requestAnimationFrame(() => addFeatureLabelChips(svgEl));
    map.fitBounds(siteBounds);
    const zoomDetailThreshold = map.getBoundsZoom(siteBounds) - ZOOM_DETAIL_MARGIN;

    // Zoom-dependent detail (spec/06): trees and plot labels look better and pan
    // faster on older phones when hidden while zoomed out. Applied once for the
    // initial fit, then on every zoom change.
    const applyZoomDetail = () => {
      svgEl.classList.toggle("is-zoomed-out", map.getZoom() < zoomDetailThreshold);
    };
    applyZoomDetail();
    map.on("zoomend", applyZoomDetail);

    // attachSync (lib/sync/) owns the subscription, the connection signals, the
    // reconnect refetch, and the freshness tick. This hook only supplies the DOM
    // writes and state setters it asks for — colony-theme.css's [data-status]
    // selectors do the rest. The client is created once, app-wide, in App.tsx
    // (docs/plans/09.md) and passed down as a prop — no longer created per colony mount.
    const detachSync = attachSync(client, colonyId, {
      // Bulk load (initial mount + reconnect refetch) — every plot at once, so the
      // per-plot fill transition is suppressed for this pass only (colony-theme.css's
      // .no-transition); a single realtime update below still animates normally.
      applyStatuses: (statuses) => {
        svgEl.classList.add("no-transition");
        for (const [svgId, status] of Object.entries(statuses)) {
          plotsById.get(svgId)?.setAttribute("data-status", status);
        }
        requestAnimationFrame(() => svgEl.classList.remove("no-transition"));
      },
      applyStatus: (svgId, status) => {
        plotsById.get(svgId)?.setAttribute("data-status", status);
      },
      setOffline,
      setFreshnessLabel,
    });

    return () => {
      cancelAnimationFrame(labelChipFrame);
      detachSync();
      map.off("zoomend", applyZoomDetail);
      mapRef.current = null;
      map.remove();
    };
  }, [client, colonyId, colonySvg, containerRef, svgRef, mapRef, setOffline, setFreshnessLabel]);
}
