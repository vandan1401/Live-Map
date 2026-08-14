import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchPlots } from "./searchPlots.ts";
import type { PlotRow } from "../db/types.ts";

function plotRow(overrides: Partial<PlotRow>): PlotRow {
  return {
    id: "plot-1",
    colony_id: "shree-vatika-2",
    svg_id: "plot-A-01",
    block: "A",
    number: "01",
    area_sqft: 1200,
    length_ft: 30,
    breadth_ft: 40,
    facing: "north",
    is_corner: false,
    status: "available",
    owner_name: null,
    owner_phone: null,
    broker_name: null,
    rate_paise: null,
    booking_amount_paise: null,
    booking_date: null,
    registry_date: null,
    notes: null,
    version: 1,
    updated_by: "test-actor",
    updated_at: new Date("2020-01-01").toISOString(),
    created_at: new Date("2020-01-01").toISOString(),
    ...overrides,
  };
}

const index = buildSearchIndex([
  plotRow({ id: "1", svg_id: "plot-A-01", block: "A", number: "01" }),
  plotRow({
    id: "2",
    svg_id: "plot-A-02",
    block: "A",
    number: "02",
    status: "booked",
    owner_name: "Rajesh Shah",
  }),
  plotRow({
    id: "3",
    svg_id: "plot-B-05",
    block: "B",
    number: "05",
    broker_name: "Vikas Patel",
  }),
  // owner_name is sticky at the DB layer even after an un-book (docs/plans/08.md §3) —
  // search must not surface or match on it once the plot is no longer booked (/review
  // finding on docs/plans/08.md).
  plotRow({
    id: "4",
    svg_id: "plot-A-03",
    block: "A",
    number: "03",
    status: "available",
    owner_name: "Vikas Mehta",
  }),
]);

describe("searchPlots", () => {
  it("finds a plot by number", () => {
    expect(searchPlots(index, "A-02").map((e) => e.svgId)).toEqual(["plot-A-02"]);
  });

  it("finds a plot by owner name, case-insensitively and by partial match", () => {
    expect(searchPlots(index, "rajesh").map((e) => e.svgId)).toEqual(["plot-A-02"]);
  });

  it("finds a plot by broker name", () => {
    expect(searchPlots(index, "Vikas").map((e) => e.svgId)).toEqual(["plot-B-05"]);
  });

  it("returns no results for an empty or whitespace-only query", () => {
    expect(searchPlots(index, "")).toEqual([]);
    expect(searchPlots(index, "   ")).toEqual([]);
  });

  it("returns no results when nothing matches", () => {
    expect(searchPlots(index, "nonexistent")).toEqual([]);
  });

  it("does not throw when owner and broker are both null", () => {
    expect(searchPlots(index, "A-01").map((e) => e.svgId)).toEqual(["plot-A-01"]);
  });

  it("does not surface or match a sticky owner_name once the plot is no longer booked", () => {
    const entry = index.find((e) => e.svgId === "plot-A-03");
    expect(entry?.ownerName).toBeNull();
    expect(searchPlots(index, "vikas mehta")).toEqual([]);
  });
});
