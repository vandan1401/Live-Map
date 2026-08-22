import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSync } from "../../lib/sync/attachSync.ts";
import { parseColonyModel, type ColonyModel } from "./colonyModel.ts";
import { resolveColonyTheme } from "./colonyTheme.ts";
import { createColonyCanvasLayer, type ColonyCanvasLayer } from "./colonyCanvasLayer.ts";
import { pickPlotAt } from "./plotPicker.ts";
import { StatusTransitions } from "./statusTransitions.ts";
import { usePlotDimensions, type PlotDimensions } from "./usePlotDimensions.ts";
import {
  colonyLatLngBounds,
  leafletViewState,
  screenToWorld,
  SELECT_ZOOM,
  ZOOM_DETAIL_MARGIN,
} from "./view.ts";
import grassPhotoUrl from "../../assets/textures/grass-satellite.jpg";

// Leaflet init, the canvas layer, attachSync's subscription, picking and the transition
// clock — the canvas equivalent of useColonyMapMount.ts + useSelectedPlotOverlay.ts, which
// this replaces (docs/plans/18.md). ColonyMap.tsx owns the refs and React state; this hook
// only writes into them and into the layer.

interface Args {
  containerRef: RefObject<HTMLDivElement | null>;
  client: SupabaseClient;
  colonyId: string;
  colonySvg: string | null;
  selectedId: string | null;
  activeStatuses: ReadonlySet<string>;
  onSelect: (svgId: string | null) => void;
  setOffline: (offline: boolean) => void;
  setFreshnessLabel: (label: string) => void;
}

export interface CanvasMapHandle {
  /** Repaint one plot immediately after a local write, animating like a remote one would. */
  applyStatus: (svgId: string, status: string) => void;
  /** Plots the database knows about that the SVG does not — never allowed to be silent. */
  orphanCount: number;
}

function loadGrass(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = grassPhotoUrl;
  });
}

export function useColonyCanvas(args: Args): CanvasMapHandle {
  const { containerRef, client, colonyId, colonySvg, selectedId, activeStatuses, onSelect } = args;
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<ColonyCanvasLayer | null>(null);
  const modelRef = useRef<ColonyModel | null>(null);
  const statusesRef = useRef<Record<string, string>>({});
  const transitionsRef = useRef(new StatusTransitions());
  const fitZoomRef = useRef(0);
  const dimensionsRef = useRef<PlotDimensions | null>(null);
  const [orphanCount, setOrphanCount] = useState(0);

  // Latest selection/filter without re-running the mount effect — the map must survive a
  // selection the same way it already survives the table-view overlay opening.
  const viewStateRef = useRef({ selectedId, activeStatuses });
  viewStateRef.current = { selectedId, activeStatuses };

  // Callbacks live in refs so the mount effect can depend only on the colony, not on every
  // render's fresh closures.
  const pushState = useRef(() => {});
  pushState.current = () => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.setDrawState({
      statuses: statusesRef.current,
      selectedId: viewStateRef.current.selectedId,
      activeStatuses: viewStateRef.current.activeStatuses,
      showPlotLabels: map.getZoom() >= fitZoomRef.current - ZOOM_DETAIL_MARGIN,
      grass: null,
      road: null,
      transitions: transitionsRef.current.progress(performance.now()),
      dimensions: dimensionsRef.current,
    });
  };

  // Starts the repaint loop for a 400ms status fade. The loop itself is owned by the
  // mount effect below, so its frame id is effect-local and the teardown cancels the value
  // that was actually scheduled — reading a ref in a cleanup gives you whatever it holds
  // when React runs it, which is a different thing and a real source of leaked frames.
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
        grassImage,
        state: {
          statuses: {},
          selectedId: null,
          activeStatuses: new Set<string>(),
          showPlotLabels: true,
          grass: null,
          road: null,
          transitions: new Map(),
          dimensions: null,
        },
      });
      layer.addTo(map);
      layerRef.current = layer;
      pushState.current();
    });

    // The layer redraws itself on move/zoom; only this knows whether labels are allowed at
    // the new zoom, so the detail threshold is re-evaluated here.
    const onZoom = () => pushState.current();
    map.on("zoomend", onZoom);

    // Picking by geometry. React's delegated onClick used to do this through the DOM;
    // there is no DOM to hit any more, so the pick is explicit.
    const onClick = (e: L.LeafletMouseEvent) => {
      const currentModel = modelRef.current;
      if (!currentModel) return;
      const size = map.getSize();
      const center = map.getCenter();
      const view = leafletViewState(map.getZoomScale(map.getZoom(), 0), center.lat, center.lng);
      const [wx, wy] = screenToWorld(
        view,
        { width: size.x, height: size.y },
        e.containerPoint.x,
        e.containerPoint.y,
      );
      const plot = pickPlotAt(currentModel, wx, wy);
      // Tapping the map rather than a plot dismisses the sheet (spec/03).
      onSelect(plot ? plot.id : null);
    };
    map.on("click", onClick);

    const detachSync = attachSync(client, colonyId, {
      // Bulk load (initial mount + reconnect refetch). Registers no transitions, so 675
      // plots arriving at once do not become 675 simultaneous fades.
      applyStatuses: (statuses) => {
        statusesRef.current = { ...statuses };
        // An orphaned plot row must never be silently invisible (spec/00-rules.md,
        // apps/map failure mode 4). The renderer this replaces did
        // `plotsById.get(id)?.setAttribute(...)` and said nothing at all when the id was
        // unknown. Counted, surfaced in the dev badge, never thrown — a half-imported
        // colony must still render.
        const known = new Set(model.plots.map((p) => p.id));
        let orphans = 0;
        for (const id of Object.keys(statuses)) if (!known.has(id)) orphans++;
        setOrphanCount(orphans);
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
      layerRef.current = null;
      mapRef.current = null;
      modelRef.current = null;
      map.remove();
    };

  }, [client, colonyId, colonySvg, containerRef, onSelect, args.setOffline, args.setFreshnessLabel]);

  // Selection and legend filter both repaint, without remounting the map.
  useEffect(() => {
    pushState.current();
  }, [selectedId, activeStatuses]);

  // Flying to a plot is a SEPARATE effect keyed only on the selection. Folding it in above
  // meant tapping a legend chip while a plot was selected re-centred and re-zoomed the map
  // under the user's finger (/review, 2026-08-22).
  useEffect(() => {
    const map = mapRef.current;
    const model = modelRef.current;
    if (!map || !model || !selectedId) return;
    const plot = model.plots.find((p) => p.id === selectedId);
    if (!plot) return;
    const cx = (plot.bbox.minX + plot.bbox.maxX) / 2;
    const cy = (plot.bbox.minY + plot.bbox.maxY) / 2;
    map.setView([-cy, cx], SELECT_ZOOM, { animate: true });
  }, [selectedId]);


  usePlotDimensions(client, colonyId, selectedId, dimensionsRef, useCallback(() => pushState.current(), []));

  return { applyStatus: (svgId, status) => applyRef.current(svgId, status), orphanCount };
}
