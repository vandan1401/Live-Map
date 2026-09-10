import type L from "leaflet";
import type { ColonyCanvasLayer } from "./colonyCanvasLayer.ts";
import type { ColonyModel } from "./colonyModel.ts";
import { resolveMapBackdrop, type MapBackdrop, type MapBackdropSurface } from "./mapBackdrops.ts";
import { loadMapBackdropImage } from "./loadMapBackdrop.ts";
import { createBackdropLabelLayer } from "./mapBackdropLabels.ts";
import { backdropCoveredWorldBounds } from "./mapBackdropTransform.ts";
import { colonyLatLngBounds, paddedColonyLatLngBounds, worldRectLatLngBounds } from "./view.ts";

// docs/plans/28.md, D-036: one colony's synthetic-aerial backdrop -- resolution, the async
// image load, the place/road label markers, and the edge-vignette fade all live here so
// usePublicColonyCanvas.ts's own mount effect only calls one function (invariant 7's
// 250-line cap, /review 2026-09-08). Not a React hook despite the module's name (kept
// alongside useFlyToSelectedPlot.ts for discoverability) -- its lifecycle must start/stop
// in lockstep with the SAME map/layer instances usePublicColonyCanvas.ts's effect creates,
// not on an independent trigger, so that effect owns calling attach()/controller.destroy()
// directly rather than this module running its own useEffect.

// Zoom range (Leaflet zoom units) over which the edge vignette fades out past the default
// fit view -- fully opaque at fitZoom, fully gone by fitZoom + VIGNETTE_FADE_RANGE. Matches
// the approved experiments/map-texture-poc/zoom_labels_demo.html prototype's own
// edgeBlurOpacity(), which fades over a 1.6x SCALE ratio (`(s - baseScale) / (baseScale *
// 0.6)`) -- converted to a Leaflet zoom delta via log2(1.6) since Leaflet zoom is a log2
// scale (view.ts's own header comment), not a linear one (/review 2026-09-08 caught the
// first value here, 1.2, as an uncited guess that didn't actually match its own citation).
const VIGNETTE_FADE_RANGE = Math.log2(1.6);

// Plain fitBounds(colonyLatLngBounds(...)) fits ONLY the colony's own tight bbox, filling
// the whole viewport with just the plots and zero surrounding context (/review 2026-09-08
// caught this the hard way: at that tight fit every backdrop label sits 1.3x-10x the
// colony's own extent away, permanently outside the visible frame, and the raster shows as
// a ~70px crop blown up to fill the screen). The prototype's own approved default
// (zoom_labels_demo.html's colonyFitScale) instead showed the colony PLUS real surrounding
// context at a comfortable padding -- this constant reproduces that same framing for the
// real app's fit target (usePublicColonyCanvas.ts), so the vignette below (fully opaque at
// this default, fading out on zoom-in toward the tight colony view) has zoom range to work
// with, and a visitor can actually pan/zoom out toward the real villages the labels name.
// Lowered 4.5 -> 2.5 (owner ask, 2026-09-10, "tighter default zoom" -- PROGRESS.md Backlog
// #2): still shows real surrounding context (this is the whole point of the padded fit
// over a tight colonyLatLngBounds), just less of it. Only affects a colony with a
// mapBackdrop.json entry (today, bharatkshetra) -- every other colony's default fit was
// already the tight, un-padded colonyLatLngBounds and is unchanged. Needs the owner's own
// eyes on a real device (CLAUDE.md: Claude has no browser to verify a visual calibration
// like this against) -- not independent of the still-deferred fly-in animation (#3), where
// "how zoomed in on load" becomes "where the animation lands" instead of a static value.
export const BACKDROP_FIT_PADDING = 2.5;

// usePublicColonyCanvas.ts's minZoom for a backdrop colony is NOT a fixed constant -- this
// derives it from the raster's own world extent via map.setMinZoom(), once the real
// viewport size is known (called from fit(), after the map is constructed with a generous
// placeholder minZoom), so a visitor can never zoom out past the raster's edge onto bare
// grass with no falloff (/review 2026-09-08: a fixed guessed -8 let exactly that happen --
// two of the six "MD2512" road-ref labels sit within a few dozen raster px of that edge).
// getBoundsZoom's `inside=true` is load-bearing: default (false) returns the zoom at which
// the raster fits ENTIRELY INSIDE the viewport (letterboxed, `Math.min` of the two axis
// ratios) -- the opposite of what's needed here. `true` returns the zoom at which the
// viewport fits inside the raster (`Math.max` of the two ratios), i.e. the raster covers
// the whole screen with no exposed edge on the binding axis (a second /review pass,
// 2026-09-08, caught the first version using the default and still showing bare grass on a
// portrait phone). setMaxBounds stops PANNING past the same edge, independent of zoom.
//
// Placeholder BEFORE re-measuring, not just at construction: getBoundsZoom clamps its own
// result to the map's CURRENT minZoom (`Math.max(this.getMinZoom(), ...)`), so writing this
// function's own prior output back into minZoom makes every call after the first ratchet
// up-only -- a resize into a MORE permissive orientation (e.g. portrait -> landscape) would
// silently lose zoom-out range instead of gaining it (a third /review 2026-09-08 pass).
// setMinZoom itself never moves the camera except to correct an out-of-range current zoom,
// so lowering it here first is safe.
export const BACKDROP_PLACEHOLDER_MIN_ZOOM = -20;

export interface BackdropFit {
  backdrop: MapBackdrop | null;
  bounds: [[number, number], [number, number]];
  minZoom: number;
}

// Shared by useColonyCanvas.ts and usePublicColonyCanvas.ts's mount effects — resolves the
// backdrop once and derives the L.map() constructor args that depend on whether one exists
// (padded bounds + the generous placeholder minZoom vs. the plain tight-fit ones), so
// neither hook duplicates this branching (both were independently at risk of invariant 7's
// 250-line cap once admin gained backdrop parity, 2026-09-09).
export function resolveBackdropFit(colonyId: string | null, surface: MapBackdropSurface, model: ColonyModel): BackdropFit {
  const backdrop = resolveMapBackdrop(colonyId, surface);
  return {
    backdrop,
    bounds: backdrop
      ? paddedColonyLatLngBounds(model.width, model.height, BACKDROP_FIT_PADDING)
      : colonyLatLngBounds(model.width, model.height),
    minZoom: backdrop ? BACKDROP_PLACEHOLDER_MIN_ZOOM : -2,
  };
}

export function applyBackdropMinZoom(map: L.Map, backdrop: MapBackdrop): void {
  const { transform, imageWidth, imageHeight } = backdrop.data;
  // backdropCoveredWorldBounds (mapBackdropTransform.ts), not the circumscribing
  // backdropWorldBounds -- using the latter here left visible bare-grass wedges at the
  // raster's real (rotated) edges even while nominally "covering the viewport" (a 4th
  // /review 2026-09-08 pass; see that function's own comment for the geometry).
  const r = backdropCoveredWorldBounds(transform, imageWidth, imageHeight);
  const bounds = worldRectLatLngBounds(r.minX, r.minY, r.maxX, r.maxY);
  map.setMinZoom(BACKDROP_PLACEHOLDER_MIN_ZOOM);
  map.setMinZoom(map.getBoundsZoom(bounds, true));
  map.setMaxBounds(bounds);
}

export interface MapBackdropController {
  /** Call on every zoom change (and once after the initial fit) — updates the vignette's
   * opacity. Labels need no per-zoom update (mapBackdropLabels.ts, 2026-09-08). */
  update(): void;
  destroy(): void;
}

// Takes an already-resolved backdrop (usePublicColonyCanvas.ts resolves it once, up front,
// since it also needs to know whether one exists before computing fit() 's own bounds —
// see BACKDROP_FIT_PADDING above) rather than a colonyId, so resolution never happens
// twice for one mount.
export function attachMapBackdrop(
  map: L.Map,
  layer: ColonyCanvasLayer,
  backdrop: MapBackdrop | null,
  getFitZoom: () => number,
  vignetteEl: HTMLDivElement | null,
): MapBackdropController | null {
  if (!backdrop) return null;

  const labels = createBackdropLabelLayer(map, backdrop.data.labels);

  // Same non-blocking "swap in once decoded" shape as loadGrass — a backdrop image is a
  // network fetch too, and first paint must not wait on it. On a rural-India phone
  // (tier-3.md's real target device) on a public link, this fetch failing/blocking is a
  // real, not hypothetical, case -- without imageFailed below, a failed fetch left the
  // padded fit, raster-derived minZoom/maxBounds, vignette, labels, and ODbL attribution
  // all applied around an image that never arrived: strictly worse than no backdrop at
  // all, and reachable with no bug (/review 2026-09-08). The fit/minZoom/maxBounds stay as
  // applied even on failure (undoing camera state after the fact would be its own can of
  // worms) -- see PROGRESS.md Deferred -- but the decorations that only make sense WITH a
  // visible image are torn down.
  let cancelled = false;
  let imageFailed = false;
  void loadMapBackdropImage(backdrop.url).then((image) => {
    if (cancelled) return;
    if (!image) {
      imageFailed = true;
      labels.destroy();
      update();
      return;
    }
    layer.setBackdrop({
      image,
      transform: backdrop.data.transform,
      imageWidth: backdrop.data.imageWidth,
      imageHeight: backdrop.data.imageHeight,
      darkenAlpha: backdrop.data.darkenAlpha,
    });
  });

  const update = () => {
    if (!vignetteEl) return;
    if (imageFailed) {
      vignetteEl.style.opacity = "0";
      return;
    }
    const t = (map.getZoom() - getFitZoom()) / VIGNETTE_FADE_RANGE;
    vignetteEl.style.opacity = String(Math.max(0, Math.min(1, 1 - t)));
  };
  update();

  const destroy = () => {
    cancelled = true;
    labels.destroy();
  };

  return { update, destroy };
}
