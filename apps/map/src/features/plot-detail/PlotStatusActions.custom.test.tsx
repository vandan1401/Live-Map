import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlotStatusActions } from "./PlotStatusActions.tsx";
import type { ColonyStatus, PlotRow } from "../../lib/db/types.ts";

// docs/plans/40.md: a colony that declares its own statuses gets buttons for exactly the moves its
// list makes legal. docs/plans/41.md (D-054): a custom status also moves directly to and from
// booked/registered, and the owner the plot was booked for stays (no buyer-name prompt on those).
const STATUSES: ColonyStatus[] = [
  { key: "available", label: "Available", colour: "#aa8800" },
  { key: "booked", label: "Booked", colour: "#2244cc" },
  { key: "registered", label: "Registry done", colour: "#cc1144" },
  { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
];

afterEach(() => cleanup());

function plotIn(status: string): PlotRow {
  return {
    id: "plot-1", colony_id: "c", org_id: "o", svg_id: "plot-A-01", block: "A", number: "1",
    area_sqft: 1200, length_ft: 30, breadth_ft: 40, facing: "north", is_corner: false, status,
    owner_name: null, owner_phone: null, broker_name: null, rate_paise: null,
    booking_amount_paise: null, booking_date: null, registry_date: null, notes: null, version: 1,
    updated_by: "someone", updated_at: new Date("2020-01-01").toISOString(),
    created_at: new Date("2020-01-01").toISOString(),
  };
}

function renderActions(status: string, onChangeStatus = vi.fn()) {
  render(
    <PlotStatusActions
      plot={plotIn(status)}
      history={[]}
      actor="me"
      saving={false}
      statuses={STATUSES}
      statusLabels={Object.fromEntries(STATUSES.map((s) => [s.key, s.label]))}
      onChangeStatus={onChangeStatus}
      onUndo={vi.fn()}
    />,
  );
  return onChangeStatus;
}

describe("PlotStatusActions — a colony's custom status", () => {
  it("offers 'Mark Sold to investors' on an available plot, alongside booking", () => {
    renderActions("available");
    expect(screen.getByRole("button", { name: "Mark Sold to investors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Book/i })).toBeTruthy();
  });

  it("changes the status to the custom key, with no buyer-name prompt", () => {
    const onChange = renderActions("available");
    expect(screen.queryByPlaceholderText("Buyer name")).not.toBeNull(); // booking still has one
    fireEvent.click(screen.getByRole("button", { name: "Mark Sold to investors" }));
    expect(onChange).toHaveBeenCalledWith("sold_to_investors");
  });

  it("on a sold_to_investors plot offers Available, Booked and Registry done, with no buyer-name prompt", () => {
    renderActions("sold_to_investors");
    expect(screen.getByRole("button", { name: "Mark Available" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark Booked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark Registry done" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("Buyer name")).toBeNull();
  });

  it("'Mark Booked' from sold_to_investors sends no owner name, so the booked-for owner stays", () => {
    const onChange = renderActions("sold_to_investors");
    fireEvent.click(screen.getByRole("button", { name: "Mark Booked" }));
    expect(onChange).toHaveBeenCalledWith("booked");
  });

  it("a booked or registered plot can be marked sold to investors directly, sending no owner name", () => {
    for (const status of ["booked", "registered"]) {
      cleanup();
      const onChange = renderActions(status);
      fireEvent.click(screen.getByRole("button", { name: "Mark Sold to investors" }));
      expect(onChange).toHaveBeenCalledWith("sold_to_investors");
    }
  });
});
