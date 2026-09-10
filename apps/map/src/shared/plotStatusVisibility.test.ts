import { describe, expect, it } from "vitest";
import { applyStatusVisibility } from "./plotStatusVisibility.ts";

describe("applyStatusVisibility", () => {
  it("returns the real statuses unchanged when visible", () => {
    const statuses = { "plot-A-1": "booked", "plot-A-2": "available" };
    expect(applyStatusVisibility(statuses, true)).toEqual(statuses);
  });

  it("forces every svg_id to 'available' when not visible", () => {
    const statuses = { "plot-A-1": "booked", "plot-A-2": "registered" };
    expect(applyStatusVisibility(statuses, false)).toEqual({
      "plot-A-1": "available",
      "plot-A-2": "available",
    });
  });

  it("stays empty for an empty input either way", () => {
    expect(applyStatusVisibility({}, true)).toEqual({});
    expect(applyStatusVisibility({}, false)).toEqual({});
  });
});
