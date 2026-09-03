import L from "leaflet";
import type { ColonyModel } from "./colonyModel.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import { buildGrassPattern, buildRoadEdgePattern, buildRoadPattern } from "./canvasPatterns.ts";
import { drawColony, type DrawState } from "./drawColony.ts";
import type { DimensionConfig } from "./drawDimensions.ts";
import { leafletViewState } from "./view.ts";

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
  // usePublicColonyCanvas.ts (owner ask, 2026-09-01: the public link "takes a bit too long
  // to load"): the grass photo is a network fetch, and the layer used to only ever build
  // its pattern once, from whatever image `createColonyCanvasLayer` was constructed with —
  // so a caller that wants to paint immediately (grassImage: null, flat ground colour) and
  // swap in the texture once it arrives needs a way to update the pattern after `onAdd()`.
  // Owner's authenticated map still constructs with the image already in hand (its own
  // mount effect awaits loadGrass() before creating the layer at all) — unaffected.
  setGrassImage(image: CanvasImageSource | null): void;
}

interface Options {
  model: ColonyModel;
  theme: ColonyTheme;
  state: DrawState;
  grassImage: CanvasImageSource | null;
  // docs/plans/27.md — resolved from presentation.json by the caller; omitted keeps
  // drawPlotDimensions's own default.
  dimensionConfig?: DimensionConfig;
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
  _road: CanvasPattern | null;
  _roadEdge: CanvasPattern | null;
  _map: L.Map | null;
  _canvas: HTMLCanvasElement | null;
  _ctx: CanvasRenderingContext2D | null;
  _viewport: { width: number; height: number } | null;
  _dpr: number;
  _frame: number;
  // What the canvas actually shows right now (set at the end of every _render()) -- the
  // baseline _onAnimZoom scales/repositions FROM, mirroring Leaflet's own Renderer.
  _renderedCenter: L.LatLng | null;
  _renderedZoom: number;
  _schedule(): void;
  _resize(): void;
  _render(): void;
  _onAnimZoom(e: L.ZoomAnimEvent): void;
}

const Layer = L.Layer.extend({
  initialize(this: LayerInternals, options: Options) {
    this._model = options.model;
    this._theme = options.theme;
    this._state = options.state;
    this._dimensionConfig = options.dimensionConfig;
    this._grassImage = options.grassImage;
    this._grass = null;
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
  },

  onAdd(this: LayerInternals, map: L.Map) {
    this._map = map;
    // "leaflet-zoom-animated" is load-bearing, not decorative: Leaflet's own
    // _tryAnimatedZoom refuses to animate at all (_nothingToAnimate()) unless at least one
    // element with this class exists in the map container — our canvas lacked it, so every
    // click-to-focus zoom silently snapped instead of easing regardless of
    // zoomAnimationThreshold. The class also gets our canvas CSS-transformed along with the
    // rest of the map pane during the animation, then we redraw crisply on zoomend/viewreset.
    const canvas = L.DomUtil.create(
      "canvas",
      "leaflet-layer leaflet-zoom-animated colony-canvas",
    ) as HTMLCanvasElement;
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
    // The class alone only gets Leaflet to START an animation. Leaflet itself suppresses
    // 'move'/'zoom' until the animation's very end (Map._animateZoom's two _move calls both
    // pass supressEvent) -- 'zoomanim' is the ONLY event fired synchronously at the start,
    // and every built-in layer (Marker, ImageOverlay, GridLayer, path Renderer) uses it to
    // reposition/rescale itself immediately so the CSS transition has something to animate
    // between. Without this, the canvas sat motionless for the whole transition and snapped
    // at the end -- indistinguishable from no animation at all.
    map.on("zoomanim", this._onAnimZoom, this);
    this._resize();
    this._render();
    return this;
  },

  onRemove(this: LayerInternals, map: L.Map) {
    map.off("move zoom viewreset resize zoomend", this._schedule, this);
    map.off("zoomanim", this._onAnimZoom, this);
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

  // Coalesce to one draw per frame. Leaflet fires `move` and `zoom` together during a
  // gesture, and drawing twice for one frame is pure waste at 17ms a draw.
  _schedule(this: LayerInternals) {
    if (this._frame || !this._map) return;
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
      },
      this._dimensionConfig,
    );
  },

  // Mirrors Leaflet's own Renderer._onAnimZoom/_updateTransform (leaflet-src.js) -- the
  // established pattern for a custom layer to ride the built-in zoom animation. Computes
  // where the LAST rendered frame's content must sit, scaled, to still line up correctly at
  // the animation's target center/zoom, so the CSS transition (enabled by the
  // "leaflet-zoom-animated" class) has a real transform change to interpolate toward.
  // _render() snaps this back to identity (via plain setPosition) once the real content is
  // redrawn at zoomend/viewreset.
  _onAnimZoom(this: LayerInternals, e: L.ZoomAnimEvent) {
    const canvas = this._canvas;
    const map = this._map;
    if (!canvas || !map || !this._renderedCenter) return;
    const scale = map.getZoomScale(e.zoom, this._renderedZoom);
    const viewHalf = map.getSize().divideBy(2);
    const currentCenterPoint = map.project(this._renderedCenter, e.zoom);
    // Public-API equivalent of Map's private _getNewPixelOrigin(center, zoom).
    const newPixelOrigin = map.project(e.center, e.zoom).subtract(viewHalf).round();
    const topLeftOffset = viewHalf.multiplyBy(-scale).add(currentCenterPoint).subtract(newPixelOrigin);
    L.DomUtil.setTransform(canvas, topLeftOffset, scale);
  },
});

// The one unavoidable cast: L.Layer.extend() returns an untyped constructor. Confined to
// this line so nothing downstream sees it.
type LayerCtor = new (options: Options) => ColonyCanvasLayer;

export function createColonyCanvasLayer(options: Options): ColonyCanvasLayer {
  return new (Layer as unknown as LayerCtor)(options);
}
