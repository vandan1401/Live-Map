import { describe, expect, it } from "vitest";
import { validateColonyManifest } from "./parseColonyManifest.ts";

// docs/plans/40.md: the upload screen validates colony.json against the REAL contract schema, so
// the `statuses` block's shape rules are proved here against it, not against a restatement.
function manifestWith(statuses: unknown) {
  return {
    colony: {
      id: "test-colony", name: "Test Colony", viewbox: [0, 0, 1000, 500], scale: { px_per_ft: 2.5 },
      north_deg: 0, generated: "2026-10-27", verified: false,
      source: { file: "test.dxf", revision: "1", plan_date: "2026-10-27", method: "dxf" },
      ...(statuses === undefined ? {} : { statuses }),
    },
    plots: [{
      svg_id: "plot-A-01", block: "A", number: "01", area_sqft: 1200, length_ft: 30, breadth_ft: 40,
      centroid: [10, 10], facing: "north", is_corner: false,
    }],
    features: [],
  };
}

const AVAILABLE = { key: "available", label: "Available", colour: "#aa8800" };
const INVESTORS = { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" };

function errorsFor(statuses: unknown): string[] {
  const result = validateColonyManifest(manifestWith(statuses));
  return result.ok ? [] : result.errors;
}

describe("colony.json statuses", () => {
  it("is optional — a manifest without it is valid exactly as before", () => {
    expect(validateColonyManifest(manifestWith(undefined)).ok).toBe(true);
  });

  it("accepts a list that includes available plus custom statuses", () => {
    const result = validateColonyManifest(manifestWith([AVAILABLE, INVESTORS]));
    expect(result.ok).toBe(true);
  });

  it("rejects a list with no `available` entry", () => {
    expect(errorsFor([INVESTORS]).length).toBeGreaterThan(0);
  });

  it("rejects more than 8 statuses", () => {
    const nine = [AVAILABLE, ...Array.from({ length: 8 }, (_, i) => ({ key: `s${i}`, label: `S${i}`, colour: "#111111" }))];
    expect(errorsFor(nine).length).toBeGreaterThan(0);
    expect(errorsFor(nine.slice(0, 8))).toEqual([]);
  });

  it("rejects an empty list, a bad colour, an uppercase key, a blank label and an unknown field", () => {
    expect(errorsFor([]).length).toBeGreaterThan(0);
    expect(errorsFor([{ ...AVAILABLE, colour: "red" }]).length).toBeGreaterThan(0);
    expect(errorsFor([{ ...AVAILABLE, colour: "#AA8800" }]).length).toBeGreaterThan(0);
    expect(errorsFor([{ ...AVAILABLE, key: "Available" }]).length).toBeGreaterThan(0);
    expect(errorsFor([{ ...AVAILABLE, label: "   " }]).length).toBeGreaterThan(0);
    expect(errorsFor([{ ...AVAILABLE, extra: 1 }]).length).toBeGreaterThan(0);
  });

  it("rejects a repeated key (a rule JSON Schema cannot express, checked after it)", () => {
    const errors = errorsFor([AVAILABLE, INVESTORS, { ...INVESTORS, label: "Again" }]);
    expect(errors.join(" ")).toContain("repeats key");
    expect(errors.join(" ")).toContain("sold_to_investors");
  });
});
