import { useEffect, useRef, useState, type MouseEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import colonySvgRaw from "../../../../fixtures/shree-vatika-2/colony.svg?raw";
import { getBrowserDbClient } from "../lib/db/browserClient.ts";
import { loadPlotStatuses } from "../lib/colony/plotStatus.ts";

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

export function ColonyMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

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
    L.svgOverlay(svgEl, bounds).addTo(map);
    map.fitBounds(bounds);

    // lib/colony stays DOM-free by design (NAVIGATION.md layer rule); applying the
    // fetched status as data-status is this component's job, not the domain layer's.
    // colony-theme.css's [data-status] selectors do the rest. Missing env vars (e.g. no
    // .env configured yet) degrade to plots rendering with no status colour, not a crash.
    let cancelled = false;
    try {
      const client = getBrowserDbClient();
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

  // React's own delegated click, not a raw addEventListener on the node Leaflet
  // owns — that listener could go stale across a dev-mode remount without any
  // visible sign, since the map still renders fine either way.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const plot = target?.closest(".plot");
    if (plot?.id) {
      console.log(plot.id);
      setLastClickedId(plot.id);
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
      {import.meta.env.DEV && lastClickedId && (
        // Dev-only stand-in for a console you can't reach on a phone. Stripped
        // from production builds by import.meta.env.DEV — not a shipped feature.
        <p className="colony-dev-click-badge">clicked: {lastClickedId}</p>
      )}
    </div>
  );
}
