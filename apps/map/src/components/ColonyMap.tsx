import { useEffect, useRef, useState, type MouseEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AnimatePresence } from "framer-motion";
import colonySvgRaw from "../../../../fixtures/shree-vatika-2/colony.svg?raw";
import { getBrowserDbClient } from "../lib/db/browserClient.ts";
import { attachSync } from "../lib/sync/attachSync.ts";
import type { PlotStatus } from "../lib/db/types.ts";
import { PlotDetailSheet } from "../features/plot-detail/PlotDetailSheet.tsx";
import { PlotSearch } from "../features/search/PlotSearch.tsx";
import { ShareSummary } from "../features/share-summary/ShareSummary.tsx";
import { FreshnessIndicator } from "./FreshnessIndicator.tsx";
import { StatusLegend } from "./StatusLegend.tsx";
import { buildDimensionArrowMarker } from "./plotDimensionOverlay.ts";
import { useSelectedPlotOverlay } from "./useSelectedPlotOverlay.ts";

const ALL_STATUSES: PlotStatus[] = ["available", "booked", "registered"];
// Margin below the fit-to-bounds zoom, not an absolute zoom level — a hardcoded
// absolute threshold (spec/06: "hide tree canopies and plot labels below a zoom
// threshold") went stale the moment the fixture's aspect ratio changed (/review
// finding: the M6 build measured "0" against a 1000x720 viewBox, and the M-Vatika-2
// real-layout swap in this same session changed it to 1000x1390, silently moving the
// fit zoom below that fixed number). Deriving it from map.getBoundsZoom() each mount
// means it tracks whatever fixture is actually loaded.
const ZOOM_DETAIL_MARGIN = 0.3;

function parseColonySvg(raw: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  svg.classList.add("colony-svg-root");
  svg.appendChild(buildDimensionArrowMarker());
  return svg;
}

interface Props {
  // From App.tsx's non-null state (D-016) — never re-read from localStorage here, so
  // there is exactly one place a missing identity can produce a fallback value, and
  // App.tsx's gate means it never has to.
  actor: string;
  // From App.tsx's ColonyPicker selection — the picker only offers verified colonies
  // (D-108), so this is always a colony this component is allowed to read.
  colonyId: string;
}

export function ColonyMap({ actor, colonyId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  // Mirrors clientRef into state (/review finding, M6): PlotSearch and ShareSummary
  // read this as a prop, and a ref mutation alone doesn't trigger their first
  // re-render. Without this, if attachSync's very first fetch happened to fail, no
  // state changed anywhere, so those two never learned the client existed — search
  // silently showed "No matches" forever, indistinguishable from a real empty result.
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sync/freshness state (M5, spec/05) — attachSync (lib/sync/) owns the subscription,
  // the tick, and the reconnect logic; this component just renders what it reports and
  // applies the DOM writes it asks for.
  const [offline, setOffline] = useState(false);
  const [freshnessLabel, setFreshnessLabel] = useState("Not synced yet");
  // Legend filter (M6, spec/06) — empty means no filter applied (every plot at full
  // opacity); a non-empty set dims every plot whose status isn't in it. Multi-select.
  const [activeStatuses, setActiveStatuses] = useState<Set<PlotStatus>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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

    const svgEl = parseColonySvg(colonySvgRaw);
    svgRef.current = svgEl;
    mapRef.current = map;
    // Read straight off the parsed SVG's own viewBox rather than a hand-maintained
    // constant — a stale copy here previously letterboxed a taller fixture into the
    // wrong bounds and threw off the selection auto-pan math (/review finding, M6).
    const { width: viewBoxWidth, height: viewBoxHeight } = svgEl.viewBox.baseVal;
    const bounds: L.LatLngBoundsExpression = [
      [0, 0],
      [viewBoxHeight, viewBoxWidth],
    ];
    L.svgOverlay(svgEl, bounds).addTo(map);
    map.fitBounds(bounds);
    const zoomDetailThreshold = map.getBoundsZoom(bounds) - ZOOM_DETAIL_MARGIN;

    // Zoom-dependent detail (spec/06): trees and plot labels look better and pan
    // faster on older phones when hidden while zoomed out. Applied once for the
    // initial fit, then on every zoom change.
    const applyZoomDetail = () => {
      svgEl.classList.toggle("is-zoomed-out", map.getZoom() < zoomDetailThreshold);
    };
    applyZoomDetail();
    map.on("zoomend", applyZoomDetail);

    // attachSync (lib/sync/) owns the subscription, the connection signals, the
    // reconnect refetch, and the freshness tick. This component only supplies the DOM
    // writes and state setters it asks for — colony-theme.css's [data-status]
    // selectors do the rest. Missing env vars (e.g. no .env configured yet) degrade to
    // plots rendering with no status colour, not a crash. The same client is reused by
    // the plot detail sheet (M3) so a click never re-reads env vars or opens a second
    // connection.
    let detachSync: (() => void) | null = null;
    try {
      const dbClient = getBrowserDbClient();
      clientRef.current = dbClient;
      setClient(dbClient);
      detachSync = attachSync(dbClient, colonyId, {
        applyStatuses: (statuses) => {
          for (const [svgId, status] of Object.entries(statuses)) {
            svgEl.querySelector(`#${svgId}`)?.setAttribute("data-status", status);
          }
        },
        applyStatus: (svgId, status) => {
          svgEl.querySelector(`#${svgId}`)?.setAttribute("data-status", status);
        },
        setOffline,
        setFreshnessLabel,
      });
    } catch (error) {
      console.error("failed to create Supabase client:", error);
    }

    return () => {
      detachSync?.();
      map.off("zoomend", applyZoomDetail);
      mapRef.current = null;
      map.remove();
    };
  }, [colonyId]);

  // Legend filter (spec/06) — classes on the SVG root, not per-plot writes, so the
  // dimming stays correct even when a realtime status change (M5) alters which plots
  // match after the filter was already set. See colony-theme.css's `.filter-*` rules.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.classList.toggle("filter-active", activeStatuses.size > 0);
    for (const status of ALL_STATUSES) {
      svg.classList.toggle(`filter-${status}`, activeStatuses.has(status));
    }
  }, [activeStatuses]);

  // Selection styling (scale, paint-order raise, auto pan/zoom) and the length/breadth
  // dimension callout all live in this hook — see useSelectedPlotOverlay.ts for why
  // they're split out of this file. One effect for every way a plot gets selected
  // (map click, search) rather than each caller repeating its own pan/zoom math.
  useSelectedPlotOverlay(svgRef, mapRef, clientRef, colonyId, selectedId);

  // Called by PlotDetailSheet after a successful write (M4) — same direct-DOM pattern
  // as the initial data-status load above, so a status change repaints immediately
  // without re-fetching every plot.
  const handlePlotStatusChange = (svgId: string, newStatus: PlotStatus) => {
    svgRef.current?.querySelector(`#${svgId}`)?.setAttribute("data-status", newStatus);
  };

  // React's own delegated click, not a raw addEventListener on the node Leaflet
  // owns — that listener could go stale across a dev-mode remount without any
  // visible sign, since the map still renders fine either way.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const plot = target?.closest(".plot");
    if (plot?.id) {
      console.log(plot.id);
      setSelectedId(plot.id);
    } else if (selectedId) {
      // Tap the map (not a plot) to dismiss the sheet (spec/03).
      setSelectedId(null);
    }
  };

  const handleToggleStatusFilter = (status: PlotStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  return (
    <div className="colony-map-container">
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleClick}
      />
      <p className="colony-scale-note">Indicative layout — not to scale</p>
      <FreshnessIndicator label={freshnessLabel} offline={offline} />
      <PlotSearch client={client} colonyId={colonyId} onSelect={setSelectedId} />
      <div className="colony-bottom-toolbar">
        <StatusLegend
          active={activeStatuses}
          onToggle={handleToggleStatusFilter}
          onClear={() => setActiveStatuses(new Set())}
        />
        <ShareSummary client={client} colonyId={colonyId} />
      </div>
      <AnimatePresence>
        {selectedId && (
          <PlotDetailSheet
            client={client}
            colonyId={colonyId}
            svgId={selectedId}
            onDismiss={() => setSelectedId(null)}
            onPlotStatusChange={handlePlotStatusChange}
            actor={actor}
          />
        )}
      </AnimatePresence>
      {import.meta.env.DEV && selectedId && (
        // Dev-only stand-in for a console you can't reach on a phone. Stripped
        // from production builds by import.meta.env.DEV — not a shipped feature.
        <p className="colony-dev-click-badge">clicked: {selectedId}</p>
      )}
    </div>
  );
}
