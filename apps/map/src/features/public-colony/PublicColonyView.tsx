import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicColony } from "../../lib/colony/publicColony.ts";
import { usePublicColonyCanvas } from "../../components/map/usePublicColonyCanvas.ts";
import { resolveMapBackdrop } from "../../components/map/mapBackdrops.ts";
import { resolvePublicLinkShowStatus } from "../../lib/colony/publicLinkConfig.ts";
import { LoadingScreen } from "../../components/LoadingScreen.tsx";
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
  // docs/plans/28.md, D-036: read by usePublicColonyCanvas.ts to fade this out on zoom;
  // unused whenever backdrop below is null (the element then never even renders).
  const backdropVignetteRef = useRef<HTMLDivElement>(null);
  // Bumped by the error state's "Try again" button (owner ask, 2026-09-01: a stalled
  // mobile connection used to leave this stuck on "Loading…" with no way back except a
  // full page reload — fetchPublicColony now times out instead of hanging forever
  // (colonies.ts), and this retry counter is what lets the resulting error state recover
  // in-app rather than needing that reload).
  const [retryCount, setRetryCount] = useState(0);

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
  }, [client, token, retryCount]);

  const found: FoundResult | null =
    result !== "loading" && result !== "error" && result.found ? result : null;

  // Owner ask, 2026-09-10: some colonies keep real booking status off the public link
  // entirely — every plot renders the "available" colour it would show before any sale,
  // gated per colony in config/publicLink.json (publicLinkConfig.ts). Client-side only, by
  // owner's own choice: get_public_colony() still returns the real status either way.
  const showStatus = resolvePublicLinkShowStatus(found?.colony.id ?? null);
  const statuses: Record<string, string> = {};
  for (const plot of found?.plots ?? []) statuses[plot.svg_id] = showStatus ? plot.status : "available";
  const selectedPlot = found?.plots.find((plot) => plot.svg_id === selectedId) ?? null;
  // docs/plans/28.md, D-036: null for every colony without a mapBackdrop.json entry —
  // decides whether the vignette/attribution below render at all.
  const backdrop = resolveMapBackdrop(found?.colony.id ?? null, "public");
  const dimensions = selectedPlot
    ? { plotId: selectedPlot.svg_id, lengthFt: selectedPlot.length_ft, breadthFt: selectedPlot.breadth_ft }
    : null;

  usePublicColonyCanvas({
    containerRef,
    colonyId: found?.colony.id ?? null,
    svg: found?.colony.svg ?? null,
    statuses,
    selectedId,
    dimensions,
    onSelect: useCallback((svgId: string | null) => setSelectedId(svgId), []),
    selectZoomRefWidthPx: found?.colony.select_zoom_ref_width_px ?? null,
    selectZoomRefHeightPx: found?.colony.select_zoom_ref_height_px ?? null,
    backdropVignetteRef,
  });

  if (result === "loading") {
    return <LoadingScreen />;
  }

  // A transport/network failure is a different state from get_public_colony() actually
  // resolving the token — it reveals nothing about whether the token names a real colony,
  // so unlike the found:false branch below, it does not need to share that message (a
  // "your link is fine, we just couldn't reach the server" case, not a security ambiguity).
  if (result === "error") {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">Could not load this colony. Check your connection and try again.</p>
        <button
          type="button"
          className="public-colony-retry-button"
          onClick={() => setRetryCount((count) => count + 1)}
        >
          Try again
        </button>
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
        {backdrop && <div ref={backdropVignetteRef} className="public-colony-backdrop-vignette" aria-hidden="true" />}
        <p className="colony-scale-note">Indicative layout — not to scale</p>
        <div className="colony-compass" aria-hidden="true">
          <span className="colony-compass-arrow">▲</span>
          <span>N</span>
        </div>
        {backdrop && (
          <p className="public-colony-backdrop-attribution">{backdrop.data.attribution}</p>
        )}
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
