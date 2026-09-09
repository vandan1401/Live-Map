import { describe, expect, it } from "vitest";
import { applyBackdropMinZoom, BACKDROP_PLACEHOLDER_MIN_ZOOM } from "./useMapBackdrop.ts";
import { backdropCoveredWorldBounds, backdropWorldBounds } from "./mapBackdropTransform.ts";
import { worldRectLatLngBounds } from "./view.ts";
import type { MapBackdrop } from "./mapBackdrops.ts";

// /review 2026-09-08 (passes 3-5 of the minZoom/maxBounds derivation, docs/plans/28.md §3):
// three regressions that each left `pnpm typecheck`/`pnpm test` green happened here already
// -- using getBoundsZoom's default `inside` (fits the box INSIDE the viewport, letterboxed,
// the opposite of "cover the screen"), reusing this function's own prior output as the
// floor for its next re-measurement (getBoundsZoom clamps to the map's CURRENT minZoom, so
// that ratchets up-only across resizes), and feeding the CIRCUMSCRIBING box
// (backdropWorldBounds) into both getBoundsZoom and setMaxBounds instead of the INSCRIBED
// one (backdropCoveredWorldBounds) that's actually covered by real raster pixels. None of
// these are visible from the shipped numbers alone -- assert the actual calls made to a
// stub map, including which bounds object, instead of trusting the comments.

const BACKDROP: MapBackdrop = {
  url: "https://example.test/backdrop.jpg",
  data: {
    transform: { x: 731.25, y: 345.0, scale: 0.0703125, rotateDeg: 2.5 },
    imageWidth: 1440,
    imageHeight: 960,
    darkenAlpha: 0.65,
    enabledOnAdmin: true,
    enabledOnPublic: true,
    attribution: "",
    labels: [],
  },
};

const COVERED_BOUNDS = (() => {
  const r = backdropCoveredWorldBounds(BACKDROP.data.transform, BACKDROP.data.imageWidth, BACKDROP.data.imageHeight);
  return worldRectLatLngBounds(r.minX, r.minY, r.maxX, r.maxY);
})();

const CIRCUMSCRIBED_BOUNDS = (() => {
  const r = backdropWorldBounds(BACKDROP.data.transform, BACKDROP.data.imageWidth, BACKDROP.data.imageHeight);
  return worldRectLatLngBounds(r.minX, r.minY, r.maxX, r.maxY);
})();

function stubMap() {
  const calls: string[] = [];
  const boundsSeen: unknown[] = [];
  const map = {
    getZoom: () => 0,
    getSize: () => ({ x: 800, y: 600 }),
    getBoundsZoom: (bounds: unknown, inside?: boolean) => {
      calls.push(`getBoundsZoom(inside=${inside})`);
      boundsSeen.push(bounds);
      return -3;
    },
    setMinZoom: (z: number) => {
      calls.push(`setMinZoom(${z})`);
    },
    setMaxBounds: (bounds: unknown) => {
      calls.push("setMaxBounds");
      boundsSeen.push(bounds);
    },
  };
  return { map, calls, boundsSeen };
}

describe("applyBackdropMinZoom", () => {
  it("calls getBoundsZoom with inside=true (cover the viewport, not fit inside it)", () => {
    const { map, calls } = stubMap();
    applyBackdropMinZoom(map as never, BACKDROP);
    expect(calls).toContain("getBoundsZoom(inside=true)");
    expect(calls).not.toContain("getBoundsZoom(inside=undefined)");
  });

  it("resets minZoom to the placeholder BEFORE re-measuring, so getBoundsZoom's own clamp can't ratchet against a prior call's result", () => {
    const { map, calls } = stubMap();
    applyBackdropMinZoom(map as never, BACKDROP);
    const placeholderIndex = calls.indexOf(`setMinZoom(${BACKDROP_PLACEHOLDER_MIN_ZOOM})`);
    const measureIndex = calls.indexOf("getBoundsZoom(inside=true)");
    expect(placeholderIndex).toBeGreaterThanOrEqual(0);
    expect(measureIndex).toBeGreaterThan(placeholderIndex);
  });

  it("passes the INSCRIBED bounds (backdropCoveredWorldBounds) to getBoundsZoom and setMaxBounds, never the circumscribing box", () => {
    const { map, boundsSeen } = stubMap();
    applyBackdropMinZoom(map as never, BACKDROP);
    expect(boundsSeen).toHaveLength(2); // one getBoundsZoom call, one setMaxBounds call
    for (const bounds of boundsSeen) {
      expect(bounds).toEqual(COVERED_BOUNDS);
      expect(bounds).not.toEqual(CIRCUMSCRIBED_BOUNDS);
    }
  });
});
