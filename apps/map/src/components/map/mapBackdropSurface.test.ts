import { describe, expect, it, vi } from "vitest";

// Own file, not mapBackdrops.test.ts -- vi.mock's module replacement is file-scoped, and
// mapBackdrops.test.ts's other tests need the real checked-in mapBackdrop.json (asserting
// real bharatkshetra field values), which this mock would otherwise shadow for the whole
// file. Covers the enabledOnAdmin/enabledOnPublic gate added alongside admin backdrop
// parity (docs/plans/28.md Backlog #1, 2026-09-09) -- the real config has no colony with
// either flag false yet, so that branch needs a fixture, not the shipped data.
vi.mock("../../config/mapBackdrop.json", () => ({
  default: {
    bharatkshetra: {
      transform: { x: 0, y: 0, scale: 1, rotateDeg: 0 },
      imageWidth: 100,
      imageHeight: 100,
      darkenAlpha: 0.5,
      enabledOnAdmin: false,
      enabledOnPublic: true,
      attribution: "",
      labels: [],
    },
  },
}));

const { resolveMapBackdrop } = await import("./mapBackdrops.ts");

describe("resolveMapBackdrop — per-surface on/off", () => {
  it("returns null on the surface whose flag is false", () => {
    expect(resolveMapBackdrop("bharatkshetra", "admin")).toBeNull();
  });

  it("still returns the backdrop on the surface whose flag is true", () => {
    expect(resolveMapBackdrop("bharatkshetra", "public")).not.toBeNull();
  });
});
