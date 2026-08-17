import { useEffect, useRef, useState, type MouseEvent } from "react";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AnimatePresence } from "framer-motion";
import type { PlotStatus } from "../lib/db/types.ts";
import { PlotDetailSheet } from "../features/plot-detail/PlotDetailSheet.tsx";
import { PlotSearch } from "../features/search/PlotSearch.tsx";
import { ShareSummary } from "../features/share-summary/ShareSummary.tsx";
import { PlotTableView } from "../features/plot-table/PlotTableView.tsx";
import { FreshnessIndicator } from "./FreshnessIndicator.tsx";
import { StatusLegend } from "./StatusLegend.tsx";
import { useSelectedPlotOverlay } from "./useSelectedPlotOverlay.ts";
import { useColonyMapMount } from "./useColonyMapMount.ts";

const ALL_STATUSES: PlotStatus[] = ["available", "booked", "registered"];

interface Props {
  // From App.tsx's single app-lifetime client (docs/plans/09.md) — no longer created
  // per colony mount, so auth state (and its session) is shared everywhere.
  client: SupabaseClient;
  // From App.tsx's session (D-020) — never re-read from localStorage here, so there is
  // exactly one place a missing identity can produce a fallback value, and App.tsx's
  // gate means it never has to.
  actor: string;
  // From App.tsx's ColonyPicker selection — the picker only offers verified colonies
  // (D-108), so this is always a colony this component is allowed to read.
  colonyId: string;
  // From the already-loaded colony row (docs/plans/11.md, D-025) — no separate fetch.
  // string | null since the DB column itself is nullable; null renders a fallback
  // message instead of feeding an empty string to DOMParser (which would white-screen
  // the app the way the sixth bug in docs/plans/10.md did for an unrelated reason).
  colonySvg: string | null;
  // Returns to the colony picker (owner feedback, 2026-08-15 iPhone session: opening a
  // colony was previously one-way). App.tsx owns selectedColonyId and clears it here.
  onBack: () => void;
}

export function ColonyMap({ client, actor, colonyId, colonySvg, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clientRef = useRef<SupabaseClient>(client);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sync/freshness state (M5, spec/05) — attachSync (lib/sync/) owns the subscription,
  // the tick, and the reconnect logic; this component just renders what it reports and
  // applies the DOM writes it asks for.
  const [offline, setOffline] = useState(false);
  const [freshnessLabel, setFreshnessLabel] = useState("Not synced yet");
  // Legend filter (M6, spec/06) — empty means no filter applied (every plot at full
  // opacity); a non-empty set dims every plot whose status isn't in it. Multi-select.
  const [activeStatuses, setActiveStatuses] = useState<Set<PlotStatus>>(new Set());
  // Table view (docs/plans/10.md) — a full-screen overlay, not a conditional replacement
  // of the map's own container div, so Leaflet's mount effect (below, keyed to
  // containerRef) never tears down and reinitialises when this toggles.
  const [tableViewOpen, setTableViewOpen] = useState(false);

  // Leaflet init, the world-ground layer, and attachSync's subscription — split into
  // useColonyMapMount.ts (invariant 7's 250-line cap; same split useSelectedPlotOverlay.ts
  // already does for selection styling below).
  useColonyMapMount(containerRef, svgRef, mapRef, client, colonyId, colonySvg, setOffline, setFreshnessLabel);

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

  if (!colonySvg) {
    return (
      <div className="colony-map-container">
        <p className="colony-scale-note">This colony has no map data.</p>
        <button type="button" className="colony-back-button" onClick={onBack}>
          ← Colonies
        </button>
      </div>
    );
  }

  return (
    <div className="colony-map-container">
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleClick}
      />
      <button type="button" className="colony-back-button" onClick={onBack}>
        ← Colonies
      </button>
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
        <button
          type="button"
          className="colony-share-trigger"
          onClick={() => setTableViewOpen(true)}
        >
          Table view
        </button>
      </div>
      {tableViewOpen && (
        <div className="plot-table-overlay">
          <PlotTableView client={client} colonyId={colonyId} onBack={() => setTableViewOpen(false)} />
        </div>
      )}
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
