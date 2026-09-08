import L from "leaflet";
import type { ColonyModel } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { buildGrassPattern, buildRoadEdgePattern, buildRoadPattern } from "./canvasPatterns.ts";
import { drawColony, type DrawState } from "./drawColony.ts";
import type { DimensionConfig } from "./drawDimensions.ts";
import { leafletViewState } from "./view.ts";
import { runFlyTo } from "./canvasFlyTo.ts";

type BackdropState = DrawState["backdrop"];

// A Leaflet layer that owns a canvas sized to the VIEWPORT, never to the colony.
//
// That distinction is the entire performance fix (docs/plans/18.md). The old renderer gave
// Leaflet an <svg> and Leaflet set a pixel width/height on it every zoom step — at zoom 4
// that element was 16,000px wide, and the world-ground one 64,000px, so the browser
// re-laid-out thousands of nodes across a vast surface for 198-237ms per step. A canvas
// pinned to the window is a few hundred pixels forever; only its *contents* change.
//
// D-009 holds, and more literally than it did with the SVG overlay: Leaflet manages pan
// and zoom on the container and never touches a plot. It also keeps pinch, drag and
// inertia, which are hardened on mobile Safari and are the riskiest thing here to
// hand-roll. Measured: 60fps on animated zoom and pan, 40fps on discrete zoom steps.

export interface ColonyCanvasLayer extends L.Layer {
  setDrawState(state: DrawState): void;
  redraw(): void;
  getCanvas(): HTMLCanvasElement | null;
  // useFlyToSelectedPlot.ts's click-to-focus zoom — see canvasFlyTo.ts for the approach.
  flyTo(center: L.LatLng, zoom: number): void;
  // usePublicColonyCanvas.ts (owner ask, 2026-09-01: public link loaded too slowly): lets a
  // caller that constructed with grassImage: null (paint immediately, flat ground colour)
  // swap the real texture in once its network fetch decodes. useColonyCanvas.ts still
  // awaits loadGrass() before constructing at all and never calls this.
  setGrassImage(image: CanvasImageSource | null): void;
  // docs/plans/28.md, D-036: same shape as setGrassImage above. useColonyCanvas.ts never
  // calls this (Non-goals — authenticated map has no backdrop).
  setBackdrop(backdrop: BackdropState): void;
}

interface Options {
  model: ColonyModel;
  theme: ColonyTheme;
  state: DrawState;
  grassImage: CanvasImageSource | null;
  // docs/plans/27.md — from presentation.json; omitted keeps drawPlotDimensions's default.
  dimensionConfig?: DimensionConfig;
  // docs/plans/28.md, D-036 — omitted/null for every colony without a backdrop.
  backdrop?: BackdropState;
}

// L.Layer.extend() is untyped, so `this` inside these methods has to be declared by hand.
// Spelling the fields out (rather than `this: any`, which was the only `any` left in
// apps/map/src) is what makes a typo in `this._ctx` a compile error instead of a blank map
// at runtime (/review, 2026-08-22).
interface LayerInternals {
  _model: ColonyModel;
  _theme: ColonyTheme;
  _state: DrawState;
  _dimensionConfig: DimensionConfig | undefined;
  _grassImage: CanvasImageSource | null;
  _grass: CanvasPattern | null;
  _backdrop: BackdropState;
  _road: CanvasPattern | null;
  _roadEdge: CanvasPattern | null;
  _map: L.Map | null;
  _canvas: HTMLCanvasElement | null;
  _ctx: CanvasRenderingContext2D | null;
  _viewport: { width: number; height: number } | null;
  _dpr: number;
  _frame: number;
  // What the canvas last actually drew — flyTo's (canvasFlyTo.ts) camera interpolation
  // starts FROM this. _flyToId/_flyToActive: see that file's FlyToHost/runFlyTo.
  _renderedCenter: L.LatLng | null;
  _renderedZoom: number;
  _flyToId: number;
  _flyToActive: boolean;
  _schedule(): void;
  _resize(): void;
  _render(): void;
}

const Layer = L.Layer.extend({
  initialize(this: LayerInternals, options: Options) {
    this._model = options.model;
    this._theme = options.theme;
    this._state = options.state;
    this._dimensionConfig = options.dimensionConfig;
    this._grassImage = options.grassImage;
    this._grass = null;
    this._backdrop = options.backdrop ?? null;
    this._road = null;
    this._roadEdge = null;
    this._map = null;
    this._canvas = null;
    this._ctx = null;
    this._viewport = null;
    this._dpr = 1;
    this._frame = 0;
    this._renderedCenter = null;
    this._renderedZoom = 0;
    this._flyToId = 0;
    this._flyToActive = false;
  },

  onAdd(this: LayerInternals, map: L.Map) {
    this._map = map;
    const canvas = L.DomUtil.create("canvas", "leaflet-layer colony-canvas") as HTMLCanvasElement;
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    // jsdom has no canvas backend, so getContext returns null under vitest. Rendering is
    // skipped rather than crashed — the React tests assert on HTML chrome, not pixels.
    if (this._ctx && this._grassImage) {
      this._grass = buildGrassPattern(this._ctx, this._grassImage);
      this._road = buildRoadPattern(this._ctx, this._theme.road);
      this._roadEdge = buildRoadEdgePattern(this._ctx, this._theme.roadEdge);
    }
    map.getPanes().overlayPane.appendChild(canvas);
    map.on("move zoom viewreset resize zoomend", this._schedule, this);
    this._resize();
    this._render();
    return this;
  },

  onRemove(this: LayerInternals, map: L.Map) {
    map.off("move zoom viewreset resize zoomend", this._schedule, this);
    if (this._frame) cancelAnimationFrame(this._frame);
    this._canvas?.remove();
    this._canvas = null;
    this._ctx = null;
    return this;
  },

  getCanvas(this: LayerInternals) {
    return this._canvas ?? null;
  },

  setDrawState(this: LayerInternals, state: DrawState) {
    this._state = state;
    this._schedule();
  },

  setGrassImage(this: LayerInternals, image: CanvasImageSource | null) {
    this._grassImage = image;
    // Rebuilt immediately if the canvas already has a context (the common case — a public
    // link's first paint already ran with grassImage: null); if onAdd() hasn't run yet,
    // onAdd() itself builds the pattern from this._grassImage, so there is nothing to redo.
    if (this._ctx) this._grass = this._grassImage ? buildGrassPattern(this._ctx, this._grassImage) : null;
    this._schedule();
  },

  setBackdrop(this: LayerInternals, backdrop: BackdropState) {
    this._backdrop = backdrop;
    this._schedule();
  },

  // Coalesce to one draw per frame. Leaflet fires `move` and `zoom` together during a
  // gesture, and drawing twice for one frame is pure waste at 17ms a draw.
  _schedule(this: LayerInternals) {
    if (this._frame || !this._map || this._flyToActive) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this._resize();
      this._render();
    });
  },

  _resize(this: LayerInternals) {
    const canvas = this._canvas;
    const map = this._map;
    if (!canvas || !map) return;
    const size = map.getSize();
    // Backing store in device pixels, CSS box in CSS pixels. Getting this wrong is what
    // makes canvas text look soft on exactly the phones this app is for.
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(size.x * dpr));
    const h = Math.max(1, Math.round(size.y * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    this._dpr = dpr;
    this._viewport = { width: size.x, height: size.y };
  },

  _render(this: LayerInternals) {
    const ctx = this._ctx;
    const map = this._map;
    const canvas = this._canvas;
    const viewport = this._viewport;
    if (!ctx || !map || !canvas || !viewport) return;
    // Keep the canvas pinned to the top-left of whatever is currently on screen, so it
    // travels with the pan instead of being redrawn into a stale position.
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const center = map.getCenter();
    this._renderedCenter = center;
    this._renderedZoom = map.getZoom();
    const view = leafletViewState(map.getZoomScale(map.getZoom(), 0), center.lat, center.lng);
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    drawColony(
      ctx,
      this._model,
      view,
      viewport,
      this._theme,
      {
        ...this._state,
        grass: this._grass,
        road: this._road,
        roadEdge: this._roadEdge,
        backdrop: this._backdrop,
      },
      this._dimensionConfig,
    );
  },

  // Click-to-focus zoom — runFlyTo (canvasFlyTo.ts) owns the interpolation/rAF loop and why
  // it redraws the real camera every frame instead of a CSS transform on a snapshot; this
  // is just the adapter onto this layer's own private fields.
  flyTo(this: LayerInternals, center: L.LatLng, zoom: number) {
    runFlyTo(
      {
        map: this._map,
        renderedCenter: this._renderedCenter,
        renderedZoom: this._renderedZoom,
        getFlyToId: () => this._flyToId,
        setFlyToId: (id) => {
          this._flyToId = id;
        },
        setFlyToActive: (active) => {
          this._flyToActive = active;
        },
        resize: () => this._resize(),
        render: () => this._render(),
      },
      center,
      zoom,
    );
  },
});

// The one unavoidable cast: L.Layer.extend() returns an untyped constructor. Confined to
// this line so nothing downstream sees it.
type LayerCtor = new (options: Options) => ColonyCanvasLayer;

export function createColonyCanvasLayer(options: Options): ColonyCanvasLayer {
  return new (Layer as unknown as LayerCtor)(options);
}
