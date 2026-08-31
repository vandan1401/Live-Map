import { describe, expect, it } from "vitest";
import {
  colonyLatLngBounds,
  computeSelectZoom,
  fitView,
  leafletViewState,
  screenToWorld,
  selectZoomFor,
  SELECT_ZOOM,
  visibleBounds,
  worldToScreen,
} from "./view.ts";
import type { ColonyModel } from "./colonyModel.ts";

const model = { width: 1000, height: 500, plots: [], decor: [], labels: [] } satisfies ColonyModel;
const viewport = { width: 800, height: 600 };

describe("view", () => {
  it("fits the whole colony and centres it", () => {
    const v = fitView(model, viewport);
    expect(v.scale).toBe(0.8); // width-limited: 800/1000 beats 600/500
    expect([v.cx, v.cy]).toEqual([500, 250]);
  });

  it("round-trips screen and world coordinates", () => {
    const v = fitView(model, viewport);
    const [wx, wy] = screenToWorld(v, viewport, 123, 456);
    const [sx, sy] = worldToScreen(v, viewport, wx, wy);
    expect(sx).toBeCloseTo(123);
    expect(sy).toBeCloseTo(456);
  });

  it("binds SVG space to Leaflet so the projection is the identity", () => {
    // lat = -y makes L.CRS.Simple's (lng, -lat) projection an identity, leaving no flip
    // to get wrong. Getting this wrong mirrors the whole colony, which looks entirely
    // plausible — every plot present, every road connected — and has bitten this
    // codebase before.
    expect(colonyLatLngBounds(1000, 500)).toEqual([[-500, 0], [0, 1000]]);
    expect(leafletViewState(2, -100, 250)).toEqual({ scale: 2, cx: 250, cy: 100 });
    // the colony's top-left corner (SVG 0,0) is Leaflet's north-west; bottom-right is
    // south-east. Asserted as the bounds themselves rather than by negating them, since
    // -0 !== 0 under toEqual and that says nothing about the mapping.
    const [[south, west], [north, east]] = colonyLatLngBounds(1000, 500);
    expect({ south, west, north, east }).toEqual({ south: -500, west: 0, north: 0, east: 1000 });
  });

  it("reports the visible rectangle in SVG units", () => {
    const b = visibleBounds({ scale: 1, cx: 100, cy: 100 }, { width: 200, height: 100 });
    expect(b).toEqual({ minX: 0, minY: 50, maxX: 200, maxY: 150 });
  });

  describe("selectZoomFor", () => {
    it("is width-limited when the reference rectangle is relatively wider than the viewport", () => {
      // viewport 800x600 (4:3), reference 400x100 (4:1) -- width ratio (2) beats height ratio (6).
      const zoom = selectZoomFor({ width: 800, height: 600 }, 400, 100);
      expect(zoom).toBeCloseTo(Math.log2(2));
    });

    it("is height-limited when the reference rectangle is relatively taller than the viewport", () => {
      // viewport 800x600, reference 100x400 -- width ratio (8) vs height ratio (1.5).
      const zoom = selectZoomFor({ width: 800, height: 600 }, 100, 400);
      expect(zoom).toBeCloseTo(Math.log2(1.5));
    });

    it("matches fitScale's ratio math for a square reference in a wide viewport", () => {
      const viewport = { width: 800, height: 600 };
      expect(selectZoomFor(viewport, 200, 200)).toBeCloseTo(Math.log2(3)); // min(4, 3)
    });

    it("returns 0 for a degenerate (zero-sized) viewport instead of -Infinity", () => {
      expect(selectZoomFor({ width: 0, height: 600 }, 200, 200)).toBe(0);
      expect(selectZoomFor({ width: 800, height: 0 }, 200, 200)).toBe(0);
    });
  });

  describe("computeSelectZoom", () => {
    const viewport = { width: 800, height: 600 };

    it("falls back to SELECT_ZOOM when either ref dimension is null", () => {
      expect(computeSelectZoom(viewport, null, 200, -2, 4)).toBe(SELECT_ZOOM);
      expect(computeSelectZoom(viewport, 200, null, -2, 4)).toBe(SELECT_ZOOM);
      expect(computeSelectZoom(viewport, null, null, -2, 4)).toBe(SELECT_ZOOM);
    });

    it("uses selectZoomFor's computed value when both ref dimensions are present", () => {
      // Same 200x200-in-800x600 case as the selectZoomFor test above: log2(3).
      expect(computeSelectZoom(viewport, 200, 200, -2, 4)).toBeCloseTo(Math.log2(3));
    });

    it("clamps a computed zoom above maxZoom down to maxZoom", () => {
      // A tiny reference rectangle demands a huge zoom to fill the viewport.
      expect(computeSelectZoom(viewport, 1, 1, -2, 4)).toBe(4);
    });

    it("clamps a computed zoom below minZoom up to minZoom", () => {
      // A reference rectangle far larger than the viewport demands a very negative zoom.
      expect(computeSelectZoom(viewport, 100000, 100000, -2, 4)).toBe(-2);
    });

    it("clamps the SELECT_ZOOM fallback too, not just a computed value", () => {
      expect(computeSelectZoom(viewport, null, null, -2, 1)).toBe(1); // SELECT_ZOOM (3.4) > maxZoom (1)
    });
  });
});
