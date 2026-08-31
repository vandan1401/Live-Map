import { useCallback, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AnimatePresence } from "framer-motion";
import type { PlotStatus } from "../lib/db/types.ts";
import { PlotDetailSheet } from "../features/plot-detail/PlotDetailSheet.tsx";
import { PlotSearch } from "../features/search/PlotSearch.tsx";
import { ShareSummary } from "../features/share-summary/ShareSummary.tsx";
import { PlotTableView } from "../features/plot-table/PlotTableView.tsx";
import { FreshnessIndicator } from "./FreshnessIndicator.tsx";
import { StatusLegend } from "./StatusLegend.tsx";
import { useColonyCanvas } from "./map/useColonyCanvas.ts";

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
  // The owner-drawn COL-ZOOM-REF rectangle's extent (docs/plans/20.md), from the same
  // already-loaded colony row as colonySvg — no separate fetch. null means the colony has
  // no such rectangle; useColonyCanvas then falls back to its fixed default zoom.
  selectZoomRefWidthPx: number | null;
  selectZoomRefHeightPx: number | null;
  // Returns to the colony picker (owner feedback, 2026-08-15 iPhone session: opening a
  // colony was previously one-way). App.tsx owns selectedColonyId and clears it here.
  onBack: () => void;
}

export function ColonyMap({
  client,
  actor,
  colonyId,
  colonySvg,
  selectZoomRefWidthPx,
  selectZoomRefHeightPx,
  onBack,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Leaflet (pan/zoom only, D-009), the canvas layer, attachSync's subscription, picking
  // and the 400ms status fade all live in useColonyCanvas.ts — the canvas renderer that
  // replaced the SVG overlay (docs/plans/18.md). Zoom went from 6fps to 60 on the paths a
  // real gesture produces.
  const canvas = useColonyCanvas({
    containerRef,
    client,
    colonyId,
    colonySvg,
    selectZoomRefWidthPx,
    selectZoomRefHeightPx,
    selectedId,
    activeStatuses,
    onSelect: useCallback((svgId: string | null) => setSelectedId(svgId), []),
    setOffline,
    setFreshnessLabel,
  });

  // Called by PlotDetailSheet after a successful write (M4) — repaints one plot without
  // re-fetching every plot, and animates it exactly as a remote change would. Paints from
  // the applied status, never an attempted one, so a rejected stale write (D-006) can
  // never leave the map showing something the database refused.
  const handlePlotStatusChange = (svgId: string, newStatus: PlotStatus) => {
    canvas.applyStatus(svgId, newStatus);
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
      <div ref={containerRef} className="h-full w-full" />
      <button type="button" className="colony-back-button" onClick={onBack}>
        ← Colonies
      </button>
      <p className="colony-scale-note">Indicative layout — not to scale</p>
      <FreshnessIndicator label={freshnessLabel} offline={offline} />
      <div className="colony-compass" aria-hidden="true">
        <span className="colony-compass-arrow">▲</span>
        <span>N</span>
      </div>
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
      {import.meta.env.DEV && (selectedId || canvas.orphanCount > 0) && (
        // Dev-only stand-in for a console you can't reach on a phone. Stripped from
        // production builds by import.meta.env.DEV — not a shipped feature. Also the one
        // place an orphaned plot row becomes visible: a `plots` row whose svg_id matches
        // no path in the SVG renders nowhere, and used to do so in total silence.
        <p className="colony-dev-click-badge">
          {selectedId ? `clicked: ${selectedId}` : null}
          {canvas.orphanCount > 0 ? ` · ${canvas.orphanCount} orphaned plot rows` : null}
        </p>
      )}
    </div>
  );
}
