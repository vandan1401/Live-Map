import { describe, expect, it } from "vitest";
import { colonyLatLngBounds, fitView, leafletViewState, screenToWorld, visibleBounds, worldToScreen } from "./view.ts";
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
});
