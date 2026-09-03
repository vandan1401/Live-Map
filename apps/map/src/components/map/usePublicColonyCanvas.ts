import { useEffect, useRef, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { parseColonyModel, type ColonyModel } from "./colonyModel.ts";
import { resolveColonyTheme } from "./colonyTheme.ts";
import { applyStatusColorOverrides } from "./applyPresentationColors.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";
import { createColonyCanvasLayer, type ColonyCanvasLayer } from "./colonyCanvasLayer.ts";
import { resolveClickedPlot } from "./plotPicker.ts";
import type { PlotDimensions } from "./usePlotDimensions.ts";
import { useFlyToSelectedPlot } from "./useFlyToSelectedPlot.ts";
import { colonyLatLngBounds, leafletViewState, ZOOM_DETAIL_MARGIN } from "./view.ts";
import { loadGrass } from "./loadGrass.ts";

// The public link's counterpart to useColonyCanvas.ts (owner ask, 2026-09-01: "exactly copy
// colony owners ui" for the public link — real pan/zoom, fly-to-plot on selection, and the
// same dashed dimension-line overlay a signed-in family member sees). Shares the Leaflet
// mount, the canvas layer and drawColony.ts's paint code with useColonyCanvas.ts, but drops
// everything that needs an authenticated fetch:
//
// - No attachSync — get_public_colony() already returned every status this view will ever
//   show (docs/plans/22.md's "no live realtime subscription" Non-goal, unchanged by this
//   plan); nothing here calls supabase.from("plots") at all, so there is no path for a
//   PII/money column to reach an anonymous visitor's browser (tier-2.md's layer discipline,
//   plus the get_public_colony()-only discipline docs/plans/22.md/25.md established).
// - No corner-plot fetch (fetchCornerPlotIds queries the authenticated `plots` table) —
//   cornerPlots stays permanently empty, same gap the static preview already had.
// - No PlotStatusActions/status-transition fades — a public visitor never writes a status,
//   so StatusTransitions never has anything to animate.
// - dimensions come from the caller (already-loaded get_public_colony() data), never a
//   separate fetchPlotBySvgId() call — the public RPC's plots array already carries
//   length_ft/breadth_ft (docs/plans/25.md), so there is nothing left to fetch.

interface Args {
  containerRef: RefObject<HTMLDivElement | null>;
  // docs/plans/27.md — resolves this colony's status colours/dimension config; null (no
  // colony loaded yet) falls back to presentation.json's default block.
  colonyId: string | null;
  svg: string | null;
  statuses: Record<string, string>;
  selectedId: string | null;
  dimensions: PlotDimensions | null;
  onSelect: (svgId: string | null) => void;
  // docs/plans/26.md — the owner-drawn COL-ZOOM-REF extent (get_public_colony()'s colony
  // object), same prop names useColonyCanvas.ts already uses. null/null (a colony with no
  // such rectangle) falls back to the fixed SELECT_ZOOM constant, same as the authenticated
  // map (view.ts's computeSelectZoom).
  selectZoomRefWidthPx: number | null;
  selectZoomRefHeightPx: number | null;
}

export function usePublicColonyCanvas(args: Args): void {
  const { containerRef, colonyId, svg, selectedId, onSelect } = args;
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<ColonyCanvasLayer | null>(null);
  const modelRef = useRef<ColonyModel | null>(null);
  const fitZoomRef = useRef(0);

  // Latest statuses/dimensions without re-running the mount effect — same shape as
  // useColonyCanvas.ts's viewStateRef, since a public visitor tapping a second plot must
  // not remount the map under their finger.
  const drawArgsRef = useRef({ statuses: args.statuses, selectedId, dimensions: args.dimensions });
  drawArgsRef.current = { statuses: args.statuses, selectedId, dimensions: args.dimensions };

  const pushState = useRef(() => {});
  pushState.current = () => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.setDrawState({
      statuses: drawArgsRef.current.statuses,
      selectedId: drawArgsRef.current.selectedId,
      activeStatuses: new Set(),
      showPlotLabels: map.getZoom() >= fitZoomRef.current - ZOOM_DETAIL_MARGIN,
      grass: null,
      road: null,
      roadEdge: null,
      transitions: new Map(),
      dimensions: drawArgsRef.current.dimensions,
      cornerPlots: new Set(),
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !svg) return;

    const model = parseColonyModel(svg);
    modelRef.current = model;
    // docs/plans/27.md: writes this colony's status colours onto the CSS variables
    // resolveColonyTheme() reads below — must run first every time.
    applyStatusColorOverrides(colonyId ?? undefined);
    const theme = resolveColonyTheme();
    const dimensionConfig = resolvePresentationConfig(colonyId ?? undefined).dimension;
    const bounds = colonyLatLngBounds(model.width, model.height);

    const map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 4,
      zoomSnap: 0.1,
      attributionControl: false,
      // See useColonyCanvas.ts's identical option for why: default threshold (4) sits
      // inside this map's own zoom range, so fit-to-select jumps often exceeded it and
      // Leaflet snapped instead of animating.
      zoomAnimationThreshold: 8,
    });
    mapRef.current = map;

    let cancelled = false;

    // Owner ask, 2026-09-01: "the public link take a bit too long to load" — a cold, first-
    // ever visit has no cached grass photo, so waiting for it before drawing anything (the
    // owner map's own useColonyCanvas.ts pattern) left the public link blank for a whole
    // network round trip on top of the RPC fetch that already had to finish before this
    // effect could even run. Layer mounts immediately with grassImage: null (flat ground
    // colour, same fallback drawColony.ts already uses — `state.grass ?? theme.groundBase`),
    // then setGrassImage swaps the texture in once it decodes, same pattern
    // renderColonyPreview.ts already uses ("paint immediately... never blank while the
    // texture decodes").
    const layer = createColonyCanvasLayer({
      model,
      theme,
      dimensionConfig,
      grassImage: null,
      state: {
        statuses: {},
        selectedId: null,
        activeStatuses: new Set<string>(),
        showPlotLabels: true,
        grass: null,
        road: null,
        roadEdge: null,
        transitions: new Map(),
        dimensions: null,
        cornerPlots: new Set<string>(),
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
    pushState.current();

    void loadGrass().then((grassImage) => {
      if (cancelled || !grassImage) return;
      layer.setGrassImage(grassImage);
    });

    // Owner ask, 2026-09-01: "it loads only when i am pressing reload button manually" —
    // the public page's map area sits inside a flex layout (.public-colony-map-wrap, below
    // the header), unlike the authenticated map's .colony-map-container, which is
    // position: absolute; inset: 0 directly against the full-viewport #root and so is
    // reliably sized the instant it exists. fitBounds() (and the getBoundsZoom() this
    // hook's showPlotLabels threshold depends on) both read the container's size at the
    // moment they're called — calling them before this flex layout (or a web-font swap
    // changing the header's height) has actually settled reads a stale-or-zero size and
    // computes a wrong zoom that nothing afterwards corrects; a manual reload "fixed" it
    // only by chance, landing after layout had already settled by the time this effect ran.
    // ResizeObserver's callback fires with the container's real size on every change,
    // including the very first one — the initial fit is deferred to its first callback
    // rather than done eagerly here, and every later callback re-measures via
    // invalidateSize() (preserving the current pan/zoom) rather than re-fitting, so a user
    // who has already panned around isn't yanked back to the fit view by, say, the mobile
    // browser's chrome showing/hiding.
    let didInitialFit = false;
    const fit = () => {
      didInitialFit = true;
      map.fitBounds(bounds);
      fitZoomRef.current = map.getBoundsZoom(bounds);
      pushState.current();
    };
    // jsdom (unit tests only — every real browser this app targets has supported
    // ResizeObserver for years) implements no ResizeObserver at all; fall back to the old
    // eager fit rather than leaving the map permanently unfitted under test.
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const size = entries[0]?.contentRect;
            if (!size || size.width === 0 || size.height === 0) return;
            if (!didInitialFit) fit();
            else map.invalidateSize();
          });
    if (resizeObserver) resizeObserver.observe(el);
    else fit();

    const onZoom = () => pushState.current();
    map.on("zoomend", onZoom);

    // Picking by geometry, same as useColonyCanvas.ts's onClick — resolveClickedPlot is the
    // pure screenToWorld+pickPlotAt composition both share (plotPicker.ts).
    const onClick = (e: L.LeafletMouseEvent) => {
      const currentModel = modelRef.current;
      if (!currentModel) return;
      const size = map.getSize();
      const center = map.getCenter();
      const view = leafletViewState(map.getZoomScale(map.getZoom(), 0), center.lat, center.lng);
      const plot = resolveClickedPlot(
        currentModel,
        view,
        { width: size.x, height: size.y },
        e.containerPoint.x,
        e.containerPoint.y,
      );
      onSelect(plot ? plot.id : null);
    };
    map.on("click", onClick);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map.off("zoomend", onZoom);
      map.off("click", onClick);
      layerRef.current = null;
      mapRef.current = null;
      modelRef.current = null;
      map.remove();
    };
  }, [containerRef, colonyId, svg, onSelect]);

  // Selection, status and dimension changes all repaint without remounting the map — same
  // split useColonyCanvas.ts makes between its mount effect and this one.
  useEffect(() => {
    pushState.current();
  }, [args.statuses, args.selectedId, args.dimensions]);

  useFlyToSelectedPlot(
    mapRef,
    modelRef,
    selectedId,
    args.selectZoomRefWidthPx,
    args.selectZoomRefHeightPx,
  );
}
