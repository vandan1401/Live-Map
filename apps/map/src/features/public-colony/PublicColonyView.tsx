import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicColony } from "../../lib/colony/publicColony.ts";
import { renderColonyPreview } from "../../components/map/renderColonyPreview.ts";
import type { PlotShape } from "../../components/map/colonyModel.ts";
import type { PublicColonyResult } from "../../lib/db/types.ts";
import { formatPlotLabel } from "../../shared/format.ts";

interface Props {
  client: SupabaseClient;
  token: string;
}

// The one, narrow slice of a plot's data this view ever shows on click (docs/plans/25.md,
// pinned constraint) — dimensions only, the same fields/wording PlotDetailContent.tsx
// already uses for a signed-in family member.
interface PublicColonySelectedPlot {
  block: string;
  number: string;
  area_sqft: number;
  length_ft: number;
  breadth_ft: number;
}

// docs/plans/22.md phase 2: the unauthenticated, per-colony, token-scoped read-only view.
// No search, no table view, no share summary, no plot-detail sheet, no legend filter, no
// live realtime subscription (see the plan's Non-goals) — a single still render of plot
// status only, via the same renderColonyPreview() the upload-confirmation screen uses, fed
// the real statuses get_public_colony() returned. docs/plans/25.md added exactly one piece
// of interactivity on top: tapping a plot shows its dimensions (never owner/status/money —
// nothing from the authenticated PlotDetailContent/PlotDetailSheet flow).
export function PublicColonyView({ client, token }: Props) {
  const [result, setResult] = useState<PublicColonyResult | "loading" | "error">("loading");
  const [selectedPlot, setSelectedPlot] = useState<PublicColonySelectedPlot | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
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

  useEffect(() => {
    if (result === "loading" || result === "error" || !result.found || !previewRef.current) return;
    const container = previewRef.current;
    container.innerHTML = "";
    setSelectedPlot(null);
    const statuses: Record<string, string> = {};
    for (const plot of result.plots) statuses[plot.svg_id] = plot.status;
    const plotsById = new Map(result.plots.map((plot) => [plot.svg_id, plot]));
    return renderColonyPreview(container, result.colony.svg, statuses, (clicked: PlotShape | null) => {
      // A miss (tapped empty space, or a plot get_public_colony somehow didn't return —
      // should never happen, but "dismiss" is the safe default either way) clears the panel.
      const plot = clicked ? plotsById.get(clicked.id) : undefined;
      setSelectedPlot(plot ? { ...plot } : null);
    });
  }, [result]);

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
  if (!result.found) {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">This link is invalid or has been revoked.</p>
      </div>
    );
  }

  return (
    <div className="public-colony-page">
      <header className="public-colony-header">
        <h1 className="public-colony-title">{result.colony.name}</h1>
        <p className="public-colony-hint">Indicative layout — not to scale.</p>
      </header>
      <div ref={previewRef} className="public-colony-preview" />
      {selectedPlot && (
        <div className="public-colony-plot-panel">
          <button
            type="button"
            className="public-colony-plot-panel-close"
            onClick={() => setSelectedPlot(null)}
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
