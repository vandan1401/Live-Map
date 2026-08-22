import { describe, expect, it } from "vitest";
import { parsePlotPoints } from "./plotGeometry.ts";

// parsePlotPoints had no tests until 2026-08-22, which is how it shipped reading only one
// of the two path grammars this repo actually produces (docs/plans/18.md). Both are pinned
// here so the next change to it cannot quietly drop one again.
describe("parsePlotPoints", () => {
  it("reads the pipeline's comma-separated M/L grammar", () => {
    // tools/pipeline/pipeline/export/svg.py's real output shape.
    expect(parsePlotPoints("M805.87,353.92 L783.67,362.14 L768.75,321.91 Z")).toEqual([
      [805.87, 353.92],
      [783.67, 362.14],
      [768.75, 321.91],
    ]);
  });

  it("reads the shared fixture's space-separated H/V shorthand", () => {
    // fixtures/shree-vatika-2/colony.svg, plot-A-01. This returned [] before 2026-08-22.
    expect(parsePlotPoints("M100 1136.82 H180 V1283.49 H100 Z")).toEqual([
      [100, 1136.82],
      [180, 1136.82],
      [180, 1283.49],
      [100, 1283.49],
    ]);
  });

  it("does not emit a duplicate closing vertex for Z", () => {
    expect(parsePlotPoints("M0,0 L10,0 L10,10 L0,10 Z")).toHaveLength(4);
  });

  it("skips an unsupported command's numbers instead of reading them as vertices", () => {
    // An arc's parameters are radii and flags, not coordinates — reading them as points
    // would invent vertices far outside the ring and silently corrupt both the picker's
    // hit test and the dimension callout.
    expect(parsePlotPoints("M0,0 L10,0 a45 32 0 1 0 90 0 L0,10 Z")).toEqual([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
  });

  it("returns an empty array for an empty or id-only attribute", () => {
    expect(parsePlotPoints("")).toEqual([]);
  });
});
