import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlotStatusActions } from "./PlotStatusActions.tsx";
import type { ColonyStatus, PlotRow } from "../../lib/db/types.ts";

// docs/plans/40.md: a colony that declares its own statuses gets buttons for exactly the moves its
// list makes legal — custom statuses in, never a direct edge to or from booked/registered.
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

  it("on a sold_to_investors plot offers only 'Mark Available' — never booked or registered", () => {
    renderActions("sold_to_investors");
    expect(screen.getByRole("button", { name: "Mark Available" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Book/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Registry done/i })).toBeNull();
    expect(screen.queryByPlaceholderText("Buyer name")).toBeNull();
  });

  it("a booked plot cannot be marked sold to investors directly", () => {
    renderActions("booked");
    expect(screen.queryByRole("button", { name: "Mark Sold to investors" })).toBeNull();
  });
});
