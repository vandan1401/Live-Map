import { useEffect, useRef, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { parseColonyModel, type ColonyModel } from "./colonyModel.ts";
import { resolveColonyTheme } from "./colonyTheme.ts";
import { createColonyCanvasLayer, type ColonyCanvasLayer } from "./colonyCanvasLayer.ts";
import { resolveClickedPlot } from "./plotPicker.ts";
import type { PlotDimensions } from "./usePlotDimensions.ts";
import { useFlyToSelectedPlot } from "./useFlyToSelectedPlot.ts";
import { colonyLatLngBounds, leafletViewState, ZOOM_DETAIL_MARGIN } from "./view.ts";
import grassPhotoUrl from "../../assets/textures/grass-satellite.jpg";

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
  svg: string | null;
  statuses: Record<string, string>;
  selectedId: string | null;
  dimensions: PlotDimensions | null;
  onSelect: (svgId: string | null) => void;
}

function loadGrass(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = grassPhotoUrl;
  });
}

export function usePublicColonyCanvas(args: Args): void {
  const { containerRef, svg, selectedId, onSelect } = args;
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
    const theme = resolveColonyTheme();
    const bounds = colonyLatLngBounds(model.width, model.height);

    const map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 4,
      zoomSnap: 0.1,
      attributionControl: false,
    });
    mapRef.current = map;
    map.fitBounds(bounds);
    fitZoomRef.current = map.getBoundsZoom(bounds);

    let cancelled = false;

    void loadGrass().then((grassImage) => {
      if (cancelled) return;
      const layer = createColonyCanvasLayer({
        model,
        theme,
        grassImage,
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
    });

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
      map.off("zoomend", onZoom);
      map.off("click", onClick);
      layerRef.current = null;
      mapRef.current = null;
      modelRef.current = null;
      map.remove();
    };
  }, [containerRef, svg, onSelect]);

  // Selection, status and dimension changes all repaint without remounting the map — same
  // split useColonyCanvas.ts makes between its mount effect and this one.
  useEffect(() => {
    pushState.current();
  }, [args.statuses, args.selectedId, args.dimensions]);

  // No colony-specific COL-ZOOM-REF is exposed by get_public_colony() (docs/plans/25.md's
  // column list stays exactly what that plan added) — null/null makes this fall back to the
  // fixed SELECT_ZOOM constant, same as any colony without an owner-drawn COL-ZOOM-REF
  // rectangle in the authenticated app (view.ts's computeSelectZoom).
  useFlyToSelectedPlot(mapRef, modelRef, selectedId, null, null);
}
