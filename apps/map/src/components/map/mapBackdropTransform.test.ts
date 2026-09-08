import { describe, expect, it } from "vitest";
import {
  backdropPixelToWorld,
  worldToBackdropPixel,
  backdropWorldBounds,
  backdropCoveredWorldBounds,
  type MapBackdropTransform,
} from "./mapBackdropTransform.ts";

// Fixed test fixture for the transform math itself -- was Bharatkshetra's shipped
// transform at the time this test was written (experiments/map-texture-poc/
// bharatkshetra_transform_v2.json), but the two are no longer required to match: this
// file tests worldToBackdropPixel/backdropPixelToWorld/backdropCoveredWorldBounds as pure
// functions, decoupled from whatever apps/map/src/config/mapBackdrop.json ships today
// (mapBackdrops.test.ts covers that). Do not re-derive these specific numbers -- the
// round-trip/bounds/rotation-limit assertions below depend on their exact values.
const TRANSFORM: MapBackdropTransform = { x: 731.25, y: 345.0, scale: 0.0703125, rotateDeg: 2.5 };
const IMAGE_WIDTH = 1440;
const IMAGE_HEIGHT = 960;

describe("mapBackdropTransform", () => {
  it("round-trips a world point through the forward transform and back", () => {
    const world: [number, number] = [500, 600];
    const raster = worldToBackdropPixel(TRANSFORM, world[0], world[1]);
    const back = backdropPixelToWorld(TRANSFORM, raster[0], raster[1]);
    expect(back[0]).toBeCloseTo(world[0], 6);
    expect(back[1]).toBeCloseTo(world[1], 6);
  });

  it("maps the colony's own centre to a plausible pixel inside the 1440x960 backdrop", () => {
    // Bharatkshetra's real viewBox is 1000 x 1399.73 (its own colony.svg, gitignored
    // pipeline output, not checked in) --
    // its centre should land well inside the 1440x960 raster frame, not off the edge.
    const [px, py] = worldToBackdropPixel(TRANSFORM, 500, 699.865);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThan(1440);
    expect(py).toBeGreaterThan(0);
    expect(py).toBeLessThan(960);
  });

  it("recovers the pinned Bibdod label world coordinates from its raster pixel position", () => {
    // From zoom_labels_demo.html: Bibdod at raster (640.8, 329.6) -> world
    // (-1294.73, -162.70), pinned in docs/plans/28.md §3.
    const [wx, wy] = backdropPixelToWorld(TRANSFORM, 640.8, 329.6);
    expect(wx).toBeCloseTo(-1294.73, 1);
    expect(wy).toBeCloseTo(-162.7, 1);
  });

  // /review 2026-09-08 (a 4th pass): a first version of the minZoom/maxBounds derivation
  // used the CIRCUMSCRIBING box (backdropWorldBounds) directly, which -- since rotateDeg
  // is nonzero -- overhangs the real raster on every side, leaving visible bare-grass
  // wedges. backdropCoveredWorldBounds insets that away; assert the difference directly
  // rather than trusting it by construction, since this exact regression already happened
  // once.
  it("backdropCoveredWorldBounds is fully inside the raster; backdropWorldBounds is not", () => {
    const within = (px: number, py: number) => px >= 0 && px <= IMAGE_WIDTH && py >= 0 && py <= IMAGE_HEIGHT;

    const raw = backdropWorldBounds(TRANSFORM, IMAGE_WIDTH, IMAGE_HEIGHT);
    const rawCorners: [number, number][] = [
      [raw.minX, raw.minY],
      [raw.maxX, raw.minY],
      [raw.minX, raw.maxY],
      [raw.maxX, raw.maxY],
    ];
    // The circumscribing box's own corners are OUTSIDE the raster (that's the bug this
    // guards against) -- at least one must fail to round-trip into the image frame.
    expect(rawCorners.some(([wx, wy]) => !within(...worldToBackdropPixel(TRANSFORM, wx, wy)))).toBe(true);

    const covered = backdropCoveredWorldBounds(TRANSFORM, IMAGE_WIDTH, IMAGE_HEIGHT);
    const coveredCorners: [number, number][] = [
      [covered.minX, covered.minY],
      [covered.maxX, covered.minY],
      [covered.minX, covered.maxY],
      [covered.maxX, covered.maxY],
    ];
    for (const [wx, wy] of coveredCorners) {
      const [px, py] = worldToBackdropPixel(TRANSFORM, wx, wy);
      expect(within(px, py)).toBe(true);
    }
  });

  // /review 2026-09-08 (a 5th pass): past a real rotation limit the inset above exceeds
  // half the box and inverts (minY > maxY) with no error anywhere -- Leaflet's own
  // LatLngBounds silently normalises an inverted pair, so a future colony's manual
  // alignment landing here would derive a wrong, unflagged minZoom/maxBounds.
  it("throws rather than silently inverting past the rotation limit", () => {
    // atan(960/1440) = 33.7deg is the exact limit for a 1440x960 raster; 40deg is well past it.
    const steep: MapBackdropTransform = { ...TRANSFORM, rotateDeg: 40 };
    expect(() => backdropCoveredWorldBounds(steep, IMAGE_WIDTH, IMAGE_HEIGHT)).toThrow();
  });

  it("does not throw at the pinned Bharatkshetra rotation (2.5deg, nowhere near the limit)", () => {
    expect(() => backdropCoveredWorldBounds(TRANSFORM, IMAGE_WIDTH, IMAGE_HEIGHT)).not.toThrow();
  });
});
