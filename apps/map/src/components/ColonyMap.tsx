import { useEffect, useRef, useState, type MouseEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AnimatePresence } from "framer-motion";
import colonySvgRaw from "../../../../fixtures/shree-vatika-2/colony.svg?raw";
import { getBrowserDbClient } from "../lib/db/browserClient.ts";
import { loadPlotStatuses } from "../lib/colony/plotStatus.ts";
import type { PlotStatus } from "../lib/db/types.ts";
import { PlotDetailSheet } from "../features/plot-detail/PlotDetailSheet.tsx";

// The fixture's viewBox is the pixel-space bounds Leaflet's CRS.Simple pans and
// zooms over. Both halves treat this file as the single shared demo colony.
const VIEW_BOX = { width: 1000, height: 720 };
const COLONY_ID = "shree-vatika-2";

function parseColonySvg(raw: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  svg.classList.add("colony-svg-root");
  return svg;
}

interface Props {
  // From App.tsx's non-null state (D-016) — never re-read from localStorage here, so
  // there is exactly one place a missing identity can produce a fallback value, and
  // App.tsx's gate means it never has to.
  actor: string;
}

export function ColonyMap({ actor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const bounds: L.LatLngBoundsExpression = [
      [0, 0],
      [VIEW_BOX.height, VIEW_BOX.width],
    ];

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
    L.svgOverlay(svgEl, bounds).addTo(map);
    map.fitBounds(bounds);

    // lib/colony stays DOM-free by design (NAVIGATION.md layer rule); applying the
    // fetched status as data-status is this component's job, not the domain layer's.
    // colony-theme.css's [data-status] selectors do the rest. Missing env vars (e.g. no
    // .env configured yet) degrade to plots rendering with no status colour, not a crash.
    // The same client is reused by the plot detail sheet (M3) so a click never re-reads
    // env vars or opens a second connection.
    let cancelled = false;
    try {
      const client = getBrowserDbClient();
      clientRef.current = client;
      loadPlotStatuses(client, COLONY_ID)
        .then((statuses) => {
          if (cancelled) return;
          for (const [svgId, status] of Object.entries(statuses)) {
            svgEl.querySelector(`#${svgId}`)?.setAttribute("data-status", status);
          }
        })
        .catch((error: unknown) => {
          console.error("failed to load plot statuses:", error);
        });
    } catch (error) {
      console.error("failed to create Supabase client:", error);
    }

    return () => {
      cancelled = true;
      map.remove();
    };
  }, []);

  // Selected plot gets .is-selected — stroke and scale only, never a fill change,
  // since fill belongs to status (spec/03). The SVG is raw parsed markup, not a React
  // tree, so this has to be a direct DOM write, same pattern as data-status above.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg
      .querySelectorAll(".plot.is-selected")
      .forEach((el) => el.classList.remove("is-selected"));
    if (selectedId) {
      svg.querySelector(`#${selectedId}`)?.classList.add("is-selected");
    }
  }, [selectedId]);

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

  return (
    <div className="colony-map-container">
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleClick}
      />
      <p className="colony-scale-note">Indicative layout — not to scale</p>
      <AnimatePresence>
        {selectedId && (
          <PlotDetailSheet
            client={clientRef.current}
            colonyId={COLONY_ID}
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
