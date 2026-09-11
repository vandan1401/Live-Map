import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicColony } from "../../lib/colony/publicColony.ts";
import { usePublicColonyCanvas } from "../../components/map/usePublicColonyCanvas.ts";
import { resolveMapBackdrop } from "../../components/map/mapBackdrops.ts";
import { resolvePublicLinkStatusToggle } from "../../lib/colony/publicLinkConfig.ts";
import { MAP_OPEN_ZOOM_MS, MAP_OPEN_ZOOM_EASE } from "../../lib/colony/mapOpenZoomTiming.ts";
import { MapLoadingScreen } from "../../components/MapLoadingScreen.tsx";
import { StatusToggle } from "../../components/StatusToggle.tsx";
import type { PublicColonyResult } from "../../lib/db/types.ts";
import { formatPlotLabel } from "../../shared/format.ts";
import { applyStatusVisibility } from "../../shared/plotStatusVisibility.ts";

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
  // Owner ask, 2026-09-10: the toggle itself always starts off, even on a colony where it's
  // offered — see publicLinkConfig.ts for the per-colony gate on whether it's offered at all.
  const [statusRevealed, setStatusRevealed] = useState(false);
  // MapLoadingScreen's zoom-in splash (owner ask, 2026-09-10) — reset alongside `result`
  // on every token/retry so reopening (or retrying) replays the animation instead of
  // instantly revealing a map the splash never got to zoom into.
  const [splashDone, setSplashDone] = useState(false);
  // Mirrors App.tsx's useColonyOpenSplash mapZooming (owner ask, 2026-09-10) — true once
  // MapLoadingScreen's own zoom has started, so the real map underneath zooms in at the
  // same pace instead of sitting static behind the loading screen's growing hole.
  const [mapZooming, setMapZooming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult("loading");
    setSelectedId(null);
    setSplashDone(false);
    setMapZooming(false);
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

  // Owner ask, 2026-09-10: whether this colony's public link offers a status toggle at all
  // (config/publicLink.json, publicLinkConfig.ts) — StatusToggle only renders when true.
  // Either way the toggle (and every plot) starts hidden; toggleOffered just decides whether
  // a visitor *can* reveal it during their own visit. Client-side only, by owner's own
  // choice: get_public_colony() still returns the real status regardless.
  const toggleOffered = resolvePublicLinkStatusToggle(found?.colony.id ?? null);
  const rawStatuses: Record<string, string> = {};
  for (const plot of found?.plots ?? []) rawStatuses[plot.svg_id] = plot.status;
  const statuses = applyStatusVisibility(rawStatuses, toggleOffered && statusRevealed);
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
  // colony without ever seeing its data. Guarded on `result !== "loading"` (not just
  // `!found`) — `found` is equally null while still loading, and that case falls through to
  // the real page below instead, rendered under the splash.
  if (result !== "loading" && !found) {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">This link is invalid or has been revoked.</p>
      </div>
    );
  }

  return (
    <>
      {/* Always mounted, loading or not — usePublicColonyCanvas above already no-ops until
          svg/colonyId are real, so there is a real page (if an empty one) under the splash
          from the first paint, not a placeholder it has to swap out from under itself. */}
      <div className="public-colony-page">
        <header className="public-colony-header">
          <h1 className="public-colony-title">{found?.colony.name ?? ""}</h1>
        </header>
        <div className="public-colony-map-wrap">
          <div
            ref={containerRef}
            className={`colony-map-container colony-map-zoom-in${mapZooming ? " colony-map-zoom-in--zoom" : ""}`}
            style={
              { "--zoom-ms": `${MAP_OPEN_ZOOM_MS}ms`, "--zoom-ease": MAP_OPEN_ZOOM_EASE } as CSSProperties
            }
          />
          {backdrop && (
            <div ref={backdropVignetteRef} className="public-colony-backdrop-vignette" aria-hidden="true" />
          )}
          <p className="colony-scale-note">Indicative layout — not to scale</p>
          <div className="colony-compass" aria-hidden="true">
            <span className="colony-compass-arrow">▲</span>
            <span>N</span>
          </div>
          {backdrop && (
            <p className="public-colony-backdrop-attribution">{backdrop.data.attribution}</p>
          )}
          {toggleOffered && (
            <div className="public-colony-status-toggle-wrap">
              <StatusToggle active={statusRevealed} onToggle={() => setStatusRevealed((prev) => !prev)} />
            </div>
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
      {(result === "loading" || !splashDone) && (
        <MapLoadingScreen
          colonyName={found?.colony.name ?? null}
          colonyId={found?.colony.id ?? null}
          ready={!!found}
          onZoomStart={() => setMapZooming(true)}
          onFinish={() => setSplashDone(true)}
        />
      )}
    </>
  );
}
