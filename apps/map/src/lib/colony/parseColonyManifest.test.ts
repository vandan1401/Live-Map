import { describe, expect, it } from "vitest";
import {
  checkManifestVerifiedFalse,
  checkSvgIdsAgree,
  validateColonyManifest,
} from "./parseColonyManifest.ts";

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    colony: {
      id: "test-colony",
      name: "Test Colony",
      viewbox: [0, 0, 1000, 500],
      scale: { px_per_ft: 2.5 },
      north_deg: 0,
      generated: "2026-08-17",
      verified: false,
      source: { file: "test.dxf", revision: "1", plan_date: "2026-08-17", method: "dxf" },
    },
    plots: [
      {
        svg_id: "plot-A-01",
        block: "A",
        number: "01",
        area_sqft: 1200,
        length_ft: 30,
        breadth_ft: 40,
        centroid: [10, 10],
        facing: "north",
        is_corner: false,
      },
    ],
    features: [],
    ...overrides,
  };
}

describe("validateColonyManifest", () => {
  it("accepts a manifest matching the real contract schema", () => {
    const result = validateColonyManifest(validManifest());
    expect(result.ok).toBe(true);
  });

  it("rejects a manifest missing a required field", () => {
    const manifest = validManifest();
    // @ts-expect-error deliberately malformed for the test
    delete manifest.colony.id;
    const result = validateColonyManifest(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a manifest with an unknown top-level property", () => {
    const result = validateColonyManifest(validManifest({ unexpected: true }));
    expect(result.ok).toBe(false);
  });

  it("rejects a plot svg_id that doesn't match the required pattern", () => {
    const manifest = validManifest();
    manifest.plots[0].svg_id = "not-a-valid-id";
    const result = validateColonyManifest(manifest);
    expect(result.ok).toBe(false);
  });

  it("accepts a blockless plot (docs/plans/15.md)", () => {
    const manifest = validManifest();
    manifest.plots[0].svg_id = "plot-07";
    manifest.plots[0].block = "";
    manifest.plots[0].number = "07";
    const result = validateColonyManifest(manifest);
    expect(result.ok).toBe(true);
  });
});

describe("checkManifestVerifiedFalse", () => {
  it("returns true when the manifest's verified flag is false", () => {
    const result = validateColonyManifest(validManifest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(checkManifestVerifiedFalse(result.manifest)).toBe(true);
  });

  it("returns false when the manifest claims verified: true", () => {
    const result = validateColonyManifest(validManifest({ colony: { ...validManifest().colony, verified: true } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(checkManifestVerifiedFalse(result.manifest)).toBe(false);
  });
});

describe("checkSvgIdsAgree", () => {
  it("agrees when the manifest and SVG have the same plot ids", () => {
    const result = validateColonyManifest(validManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = `<svg><path id="plot-A-01"/></svg>`;
    expect(checkSvgIdsAgree(result.manifest, svg)).toEqual({ ok: true });
  });

  it("reports a plot id present in the manifest but missing from the SVG", () => {
    const result = validateColonyManifest(validManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = `<svg></svg>`;
    expect(checkSvgIdsAgree(result.manifest, svg)).toEqual({
      ok: false,
      inManifestNotSvg: ["plot-A-01"],
      inSvgNotManifest: [],
      duplicates: [],
    });
  });

  it("reports a plot id present in the SVG but missing from the manifest", () => {
    const result = validateColonyManifest(validManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = `<svg><path id="plot-A-01"/><path id="plot-A-02"/></svg>`;
    expect(checkSvgIdsAgree(result.manifest, svg)).toEqual({
      ok: false,
      inManifestNotSvg: [],
      inSvgNotManifest: ["plot-A-02"],
      duplicates: [],
    });
  });

  it("reports a duplicated svg_id within the manifest", () => {
    const manifest = validManifest();
    manifest.plots.push({ ...manifest.plots[0] });
    const result = validateColonyManifest(manifest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = `<svg><path id="plot-A-01"/></svg>`;
    const check = checkSvgIdsAgree(result.manifest, svg);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.duplicates).toEqual(["plot-A-01"]);
  });
});
