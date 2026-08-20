import { describe, expect, it } from "vitest";
import { extractSvgPlotIds } from "./svgPlotIds.ts";

describe("extractSvgPlotIds", () => {
  it("extracts every plot id from SVG markup", () => {
    const svg = `<svg><path id="plot-A-01"/><path id="plot-A-02"/><path id="road-1"/></svg>`;
    expect(extractSvgPlotIds(svg)).toEqual(new Set(["plot-A-01", "plot-A-02"]));
  });

  it("extracts a blockless plot id (docs/plans/15.md)", () => {
    const svg = `<svg><path id="plot-A-01"/><path id="plot-07"/></svg>`;
    expect(extractSvgPlotIds(svg)).toEqual(new Set(["plot-A-01", "plot-07"]));
  });

  it("de-duplicates a repeated id", () => {
    const svg = `<svg><path id="plot-A-01"/><path id="plot-A-01"/></svg>`;
    expect(extractSvgPlotIds(svg)).toEqual(new Set(["plot-A-01"]));
  });

  it("returns an empty set for SVG with no plot ids", () => {
    expect(extractSvgPlotIds(`<svg><path id="road-1"/></svg>`)).toEqual(new Set());
  });
});
