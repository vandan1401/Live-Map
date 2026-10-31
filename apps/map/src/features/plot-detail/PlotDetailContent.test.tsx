import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlotDetailContent } from "./PlotDetailContent.tsx";
import type { PlotRow } from "../../lib/db/types.ts";

// docs/plans/41.md, D-054: the owner (the buyer) shows on every status but available.
afterEach(() => cleanup());

function plotIn(status: string): PlotRow {
  return {
    id: "plot-1", colony_id: "c", org_id: "o", svg_id: "plot-A-01", block: "A", number: "01",
    area_sqft: 1200, length_ft: 30, breadth_ft: 40, facing: "north", is_corner: false, status,
    owner_name: "Rajesh Shah", owner_phone: null, broker_name: "Vikas Patel", rate_paise: null,
    booking_amount_paise: null, booking_date: null, registry_date: null, notes: null, version: 1,
    updated_by: "someone", updated_at: new Date("2020-01-01").toISOString(),
    created_at: new Date("2020-01-01").toISOString(),
  };
}

describe("PlotDetailContent — owner", () => {
  for (const status of ["booked", "registered", "sold_to_investors"]) {
    it(`shows the owner on a ${status} plot`, () => {
      render(<PlotDetailContent plot={plotIn(status)} history={[]} />);
      expect(screen.getByText("Owner")).toBeTruthy();
      expect(screen.getByText("Rajesh Shah")).toBeTruthy();
      expect(screen.queryByText("Broker")).toBeNull(); // the broker is not part of this sheet
    });
  }

  it("shows neither on an available plot, even though owner_name is sticky in the database", () => {
    render(<PlotDetailContent plot={plotIn("available")} history={[]} />);
    expect(screen.queryByText("Owner")).toBeNull();
    expect(screen.queryByText("Rajesh Shah")).toBeNull();
  });

  it("shows a dash when a plot has no owner recorded", () => {
    render(<PlotDetailContent plot={{ ...plotIn("registered"), owner_name: null }} history={[]} />);
    expect(screen.getAllByText("—").length).toBe(1);
  });
});
