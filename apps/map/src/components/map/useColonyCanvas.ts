import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSync } from "../../lib/sync/attachSync.ts";
import { countOrphanStatuses, parseColonyModel, type ColonyModel } from "./colonyModel.ts";
import { resolveColonyTheme } from "./colonyTheme.ts";
import { applyStatusColorOverrides } from "./applyPresentationColors.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";
import { createColonyCanvasLayer, type ColonyCanvasLayer } from "./colonyCanvasLayer.ts";
import { createColonyClickHandler } from "./colonyClickHandler.ts";
import { StatusTransitions } from "./statusTransitions.ts";
import { usePlotDimensions, type PlotDimensions } from "./usePlotDimensions.ts";
import { useFlyToSelectedPlot } from "./useFlyToSelectedPlot.ts";
import { colonyLatLngBounds, ZOOM_DETAIL_MARGIN } from "./view.ts";
import { loadGrass } from "./loadGrass.ts";
import { useCornerPlots } from "./useCornerPlots.ts";
import { attachMapBackdrop, applyBackdropMinZoom, resolveBackdropFit, type MapBackdropController } from "./useMapBackdrop.ts";
import { applyStatusVisibility } from "../../shared/plotStatusVisibility.ts";

// Leaflet init, the canvas layer, attachSync's subscription, picking and the transition
// clock (docs/plans/18.md). ColonyMap.tsx owns the refs and React state; this hook only
// writes into them and into the layer.

interface Args {
  containerRef: RefObject<HTMLDivElement | null>;
  client: SupabaseClient;
  colonyId: string;
  colonySvg: string | null;
  // docs/plans/20.md — null means this colony has no owner-drawn COL-ZOOM-REF rectangle,
  // so the fly-to-plot effect falls back to the fixed SELECT_ZOOM constant.
  selectZoomRefWidthPx: number | null;
  selectZoomRefHeightPx: number | null;
  selectedId: string | null;
  activeStatuses: ReadonlySet<string>;
  showStatus: boolean; // StatusToggle.tsx, ColonyMap.tsx
  onSelect: (svgId: string | null) => void;
  setOffline: (offline: boolean) => void;
  setFreshnessLabel: (label: string) => void;
  // docs/plans/28.md Backlog #1: absent/null means the backdrop update no-ops.
  backdropVignetteRef?: RefObject<HTMLDivElement | null>;
}

export interface CanvasMapHandle {
  /** Repaint one plot immediately after a local write, animating like a remote one would. */
  applyStatus: (svgId: string, status: string) => void;
  /** Plots the database knows about that the SVG does not — never allowed to be silent. */
  orphanCount: number;
}

export function useColonyCanvas(args: Args): CanvasMapHandle {
  const {
    containerRef,
    client,
    colonyId,
    colonySvg,
    selectZoomRefWidthPx,
    selectZoomRefHeightPx,
    selectedId,
    activeStatuses,
    showStatus,
    onSelect,
    backdropVignetteRef,
  } = args;
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<ColonyCanvasLayer | null>(null);
  const modelRef = useRef<ColonyModel | null>(null);
  const statusesRef = useRef<Record<string, string>>({});
  const transitionsRef = useRef(new StatusTransitions());
  const fitZoomRef = useRef(0); // tight colony-only zoom — showPlotLabels' own threshold
  const defaultZoomRef = useRef(0); // ACTUAL fit() target (padded for a backdrop colony)
  const backdropRef = useRef<MapBackdropController | null>(null); // null: no backdrop entry
  const dimensionsRef = useRef<PlotDimensions | null>(null);
  const cornerPlotsRef = useRef<ReadonlySet<string>>(new Set());
  const [orphanCount, setOrphanCount] = useState(0);

  // Latest selection/filter without re-running the mount effect — the map must survive a
  // selection the same way it already survives the table-view overlay opening.
  const viewStateRef = useRef({ selectedId, activeStatuses, showStatus });
  viewStateRef.current = { selectedId, activeStatuses, showStatus };

  // Callbacks live in refs so the mount effect can depend only on the colony, not on every
  // render's fresh closures.
  const pushState = useRef(() => {});
  pushState.current = () => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.setDrawState({
      statuses: applyStatusVisibility(statusesRef.current, viewStateRef.current.showStatus),
      selectedId: viewStateRef.current.selectedId,
      activeStatuses: viewStateRef.current.activeStatuses,
      showPlotLabels: map.getZoom() >= fitZoomRef.current - ZOOM_DETAIL_MARGIN,
      grass: null,
      road: null,
      roadEdge: null,
      transitions: transitionsRef.current.progress(performance.now()),
      dimensions: dimensionsRef.current,
      cornerPlots: cornerPlotsRef.current,
      backdrop: null, // placeholder — the real value lives on the layer, like grass/road above
    });
    backdropRef.current?.update(); // refreshed on every push, not just 'zoomend'
  };

  // Starts the repaint loop for a 400ms status fade. Owned by the mount effect below, so
  // its frame id is effect-local (a ref read in cleanup gives whatever it holds then).
  const kickRef = useRef<() => void>(() => {});
  const applyLocalStatus = (svgId: string, status: string) => {
    statusesRef.current = { ...statusesRef.current, [svgId]: status };
    transitionsRef.current.start(svgId, performance.now());
    kickRef.current();
  };
  const applyRef = useRef(applyLocalStatus);
  applyRef.current = applyLocalStatus;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !colonySvg) return;

    const model = parseColonyModel(colonySvg);
    modelRef.current = model;
    // docs/plans/27.md: writes this colony's status colours onto the CSS variables
    // resolveColonyTheme() reads below — must run first every time.
    applyStatusColorOverrides(colonyId);
    const theme = resolveColonyTheme();
    const dimensionConfig = resolvePresentationConfig(colonyId).dimension;
    // docs/plans/28.md Backlog #1 — shared with usePublicColonyCanvas.ts.
    const { backdrop, bounds, minZoom } = resolveBackdropFit(colonyId, "admin", model);
    const map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom, // fitBounds below -> applyBackdropMinZoom refines when there's a backdrop
      maxZoom: 4,
      zoomSnap: 0.1,
      attributionControl: false,
    });
    mapRef.current = map;
    map.fitBounds(bounds);
    defaultZoomRef.current = map.getBoundsZoom(bounds);
    fitZoomRef.current = map.getBoundsZoom(colonyLatLngBounds(model.width, model.height));
    if (backdrop) applyBackdropMinZoom(map, backdrop); // must run before reading minZoom below

    let cancelled = false;

    // Repaints while any fade is running, then stops. Deliberately not an always-on rAF
    // loop: a still map should cost nothing.
    const transitions = transitionsRef.current;
    let animFrame = 0;
    const tick = () => {
      pushState.current();
      animFrame = transitions.active ? requestAnimationFrame(tick) : 0;
    };
    kickRef.current = () => {
      if (!animFrame) animFrame = requestAnimationFrame(tick);
    };

    void loadGrass().then((grassImage) => {
      if (cancelled) return;
      const layer = createColonyCanvasLayer({
        model,
        theme,
        dimensionConfig,
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
          backdrop: null,
        },
      });
      layer.addTo(map);
      layerRef.current = layer;
      // Deferred to here since it needs the real layer instance (layer.setBackdrop).
      backdropRef.current = attachMapBackdrop(map, layer, backdrop, () => defaultZoomRef.current, backdropVignetteRef?.current ?? null);
      pushState.current();
    });

    // The layer redraws itself on move/zoom; only this knows whether labels are allowed at
    // the new zoom, so the detail threshold is re-evaluated here. Skipped mid-flight
    // (useFlyToSelectedPlot.ts's flyTo): a non-animated setView fires 'zoomend' on every
    // single rAF frame of that flight, so without this guard pushState — a real recompute
    // over every plot's status, not a cheap no-op — ran on every frame in addition to the
    // redraw the flight already triggers directly (D-041).
    const onZoom = () => {
      if (!layerRef.current?.isFlying()) pushState.current();
    };
    map.on("zoomend", onZoom);

    const onClick = createColonyClickHandler(map, modelRef, onSelect);
    map.on("click", onClick);

    const detachSync = attachSync(client, colonyId, {
      // Bulk load (initial mount + reconnect refetch). Registers no transitions, so 675
      // plots arriving at once do not become 675 simultaneous fades.
      applyStatuses: (statuses) => {
        statusesRef.current = { ...statuses };
        setOrphanCount(countOrphanStatuses(model.plots, statuses));
        pushState.current();
      },
      applyStatus: (svgId, status) => applyRef.current(svgId, status),
      setOffline: args.setOffline,
      setFreshnessLabel: args.setFreshnessLabel,
    });

    return () => {
      cancelled = true;
      if (animFrame) cancelAnimationFrame(animFrame);
      kickRef.current = () => {};
      transitions.clear();
      detachSync();
      map.off("zoomend", onZoom);
      map.off("click", onClick);
      backdropRef.current?.destroy();
      backdropRef.current = null;
      layerRef.current = null;
      mapRef.current = null;
      modelRef.current = null;
      map.remove();
    };
  }, [client, colonyId, colonySvg, containerRef, onSelect, args.setOffline, args.setFreshnessLabel, backdropVignetteRef]);

  // Selection, legend filter, and the status toggle all repaint, without remounting the map.
  useEffect(() => {
    pushState.current();
  }, [selectedId, activeStatuses, showStatus]);

  useFlyToSelectedPlot(mapRef, modelRef, layerRef, selectedId, selectZoomRefWidthPx, selectZoomRefHeightPx);

  usePlotDimensions(client, colonyId, selectedId, dimensionsRef, useCallback(() => pushState.current(), []));
  useCornerPlots(client, colonyId, cornerPlotsRef, useCallback(() => pushState.current(), []));

  return { applyStatus: (svgId, status) => applyRef.current(svgId, status), orphanCount };
}
