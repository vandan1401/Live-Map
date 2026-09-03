import { describe, expect, it, vi } from "vitest";
import { drawPlotDimensions } from "./drawDimensions.ts";
import type { ColonyTheme } from "./colonyTheme.ts";
import type { Point } from "../../lib/colony/plotGeometry.ts";

const THEME: ColonyTheme = {
  groundBase: "#000",
  road: "#000",
  roadEdge: "#000",
  amenity: "#000",
  amenityAccent: "#000",
  water: "#000",
  gardenTint: "#000",
  gardenBase: "#000",
  gardenBlobLight: "#000",
  plotBase: "#000",
  siteBoundary: "#000",
  plotStroke: "#000",
  plotStrokeWidth: 0.5,
  selectedStroke: "#fff",
  status: {},
  featureLabelInk: "#000",
  plotLabelInk: "#000",
};

// A square, 10x10 units — enough real geometry for drawPlotDimensions's rectangle/edge
// maths without depending on a real fixture plot.
const SQUARE: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

function createFakeCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("drawPlotDimensions", () => {
  it("uses the default offset/text template when no dimensionConfig is given", () => {
    const ctx = createFakeCtx();
    drawPlotDimensions(ctx, SQUARE, 40, 40, THEME);
    expect(ctx.fillText).toHaveBeenCalled();
    const [text] = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number, number];
    expect(text).toMatch(/ ft$/);
  });

  it("applies a custom textFormat template (docs/plans/27.md)", () => {
    const ctx = createFakeCtx();
    drawPlotDimensions(ctx, SQUARE, 40, 40, THEME, { offset: 1, textFormat: "{value}'" });
    const [text] = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number, number];
    expect(text).toMatch(/'$/);
    expect(text).not.toMatch(/ ft/);
  });

  it("moves the line further from the plot when offset increases", () => {
    const ctxNear = createFakeCtx();
    drawPlotDimensions(ctxNear, SQUARE, 40, 40, THEME, { offset: 1, textFormat: "{value} ft" });
    const nearLineTo = (ctxNear.moveTo as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number];

    const ctxFar = createFakeCtx();
    drawPlotDimensions(ctxFar, SQUARE, 40, 40, THEME, { offset: 5, textFormat: "{value} ft" });
    const farLineTo = (ctxFar.moveTo as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number];

    // Different offsets must produce different line anchor points — proves the offset
    // parameter is actually used, not just accepted and ignored.
    expect(nearLineTo).not.toEqual(farLineTo);
  });
});
