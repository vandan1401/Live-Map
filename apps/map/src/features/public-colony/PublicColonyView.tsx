import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicColony } from "../../lib/colony/publicColony.ts";
import { usePublicColonyCanvas } from "../../components/map/usePublicColonyCanvas.ts";
import type { PublicColonyResult } from "../../lib/db/types.ts";
import { formatPlotLabel } from "../../shared/format.ts";

interface Props {
  client: SupabaseClient;
  token: string;
}

type FoundResult = Extract<PublicColonyResult, { found: true }>;

// docs/plans/22.md phase 2: the unauthenticated, per-colony, token-scoped read-only view.
// Owner ask, 2026-09-01, verbatim: "no zoom on selecting a plot, no dimension lines around
// the plots... i want you to exactly copy colony owners ui" — moved this from a still,
// non-interactive render onto usePublicColonyCanvas.ts — the same
// Leaflet+canvas pipeline the signed-in map uses (real pan/zoom, fly-to-plot on selection,
// the dashed dimension-line overlay drawColony.ts already draws for a family member). This
// supersedes docs/plans/22.md's original "no pan/zoom" Non-goal for pan/zoom specifically;
// every other Non-goal it named still holds — no search, no table view, no share summary,
// no live realtime subscription, and nothing from the authenticated PlotDetailContent/
// PlotDetailSheet flow (no owner name, no status actions) reaches this view. Tapping a plot
// still shows only its dimensions (docs/plans/25.md), same wording, now alongside the
// on-canvas dimension lines rather than instead of them (owner's explicit choice when asked
// which of the two to keep).
export function PublicColonyView({ client, token }: Props) {
  const [result, setResult] = useState<PublicColonyResult | "loading" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setResult("loading");
    setSelectedId(null);
    loadPublicColony(client, token)
      .then((loaded) => {
        if (!cancelled) setResult(loaded);
      })
      .catch(() => {
        if (!cancelled) setResult("error");
      });
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  const found: FoundResult | null =
    result !== "loading" && result !== "error" && result.found ? result : null;

  const statuses: Record<string, string> = {};
  for (const plot of found?.plots ?? []) statuses[plot.svg_id] = plot.status;
  const selectedPlot = found?.plots.find((plot) => plot.svg_id === selectedId) ?? null;
  const dimensions = selectedPlot
    ? { plotId: selectedPlot.svg_id, lengthFt: selectedPlot.length_ft, breadthFt: selectedPlot.breadth_ft }
    : null;

  usePublicColonyCanvas({
    containerRef,
    svg: found?.colony.svg ?? null,
    statuses,
    selectedId,
    dimensions,
    onSelect: useCallback((svgId: string | null) => setSelectedId(svgId), []),
  });

  if (result === "loading") {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">Loading…</p>
      </div>
    );
  }

  // A transport/network failure is a different state from get_public_colony() actually
  // resolving the token — it reveals nothing about whether the token names a real colony,
  // so unlike the found:false branch below, it does not need to share that message (a
  // "your link is fine, we just couldn't reach the server" case, not a security ambiguity).
  if (result === "error") {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">Could not load this colony. Check your connection and try again.</p>
      </div>
    );
  }

  // Wrong token, revoked/regenerated token, and an unverified colony are all shown the same
  // way on purpose — see get_public_colony()'s own comment (docs/plans/22.md §3): a
  // distinguishable message would let a caller confirm a guessed uuid belongs to a real
  // colony without ever seeing its data.
  if (!found) {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">This link is invalid or has been revoked.</p>
      </div>
    );
  }

  return (
    <div className="public-colony-page">
      <header className="public-colony-header">
        <h1 className="public-colony-title">{found.colony.name}</h1>
      </header>
      <div className="public-colony-map-wrap">
        <div ref={containerRef} className="colony-map-container" />
        <p className="colony-scale-note">Indicative layout — not to scale</p>
        <div className="colony-compass" aria-hidden="true">
          <span className="colony-compass-arrow">▲</span>
          <span>N</span>
        </div>
      </div>
      {selectedPlot && (
        <div className="public-colony-plot-panel">
          <button
            type="button"
            className="public-colony-plot-panel-close"
            onClick={() => setSelectedId(null)}
            aria-label="Close"
          >
            ×
          </button>
          <h2 className="public-colony-plot-panel-heading">{formatPlotLabel(selectedPlot)}</h2>
          <dl className="public-colony-plot-panel-fields">
            <div>
              <dt>Length</dt>
              <dd>{selectedPlot.length_ft} ft</dd>
            </div>
            <div>
              <dt>Breadth</dt>
              <dd>{selectedPlot.breadth_ft} ft</dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{selectedPlot.area_sqft} sq ft</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
