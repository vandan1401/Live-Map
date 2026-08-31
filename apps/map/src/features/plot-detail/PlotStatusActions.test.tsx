import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlotStatusActions } from "./PlotStatusActions.tsx";
import type { PlotHistoryRow, PlotRow } from "../../lib/db/types.ts";

afterEach(() => {
  cleanup();
});

const basePlot: PlotRow = {
  id: "plot-1",
  colony_id: "shree-vatika-2",
  org_id: "org-test-1",
  svg_id: "plot-A-01",
  block: "A",
  number: "1",
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
  updated_by: "test-actor-a",
  updated_at: new Date("2020-01-01").toISOString(),
  created_at: new Date("2020-01-01").toISOString(),
};

function historyRow(overrides: Partial<PlotHistoryRow>): PlotHistoryRow {
  return {
    id: "hist-1",
    plot_id: "plot-1",
    org_id: "org-test-1",
    status: "available",
    changed_by: "test-actor-a",
    changed_at: new Date("2020-01-01").toISOString(),
    note: null,
    ...overrides,
  };
}

describe("PlotStatusActions", () => {
  it("only offers legal next statuses as buttons", () => {
    render(
      <PlotStatusActions
        plot={basePlot}
        history={[historyRow({})]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.getByText("Mark Booked")).toBeInTheDocument();
    expect(screen.queryByText("Mark Registry done")).not.toBeInTheDocument();
    expect(screen.queryByText("Mark Available")).not.toBeInTheDocument();
  });

  it("shows Undo only when the most recent history row is the current actor's own, and there's a prior state", () => {
    const { rerender } = render(
      <PlotStatusActions
        plot={basePlot}
        history={[historyRow({ changed_by: "test-actor-a" })]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    // Only one history row — nothing to undo to.
    expect(screen.queryByText("Undo my last change")).not.toBeInTheDocument();

    rerender(
      <PlotStatusActions
        plot={basePlot}
        history={[
          historyRow({ changed_by: "test-actor-a" }),
          historyRow({ id: "hist-0", status: "booked" }),
        ]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.getByText("Undo my last change")).toBeInTheDocument();

    rerender(
      <PlotStatusActions
        plot={basePlot}
        history={[
          historyRow({ changed_by: "someone-else" }),
          historyRow({ id: "hist-0", status: "booked" }),
        ]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByText("Undo my last change")).not.toBeInTheDocument();
  });

  it("hides Undo when the reverse transition would itself be illegal", () => {
    // Current status is registered; the prior state was booked. registered -> booked
    // is not a legal transition (only registered -> available is), so undoing here
    // would call applyPlotTransition with a transition it will reject.
    render(
      <PlotStatusActions
        plot={{ ...basePlot, status: "registered" }}
        history={[
          historyRow({ status: "registered", changed_by: "test-actor-a" }),
          historyRow({ id: "hist-0", status: "booked" }),
        ]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByText("Undo my last change")).not.toBeInTheDocument();
  });

  it("warns when someone else edited recently, not when the actor edited it themselves", () => {
    const { rerender } = render(
      <PlotStatusActions
        plot={{ ...basePlot, updated_by: "someone-else", updated_at: new Date().toISOString() }}
        history={[historyRow({})]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.getByText(/edited this a few minutes ago/)).toBeInTheDocument();

    rerender(
      <PlotStatusActions
        plot={{ ...basePlot, updated_by: "test-actor-a", updated_at: new Date().toISOString() }}
        history={[historyRow({})]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByText(/edited this a few minutes ago/)).not.toBeInTheDocument();
  });

  it("disables Mark Booked until a buyer name is entered, and calls onChangeStatus with the trimmed name", () => {
    const onChangeStatus = vi.fn();
    render(
      <PlotStatusActions
        plot={basePlot}
        history={[historyRow({})]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={onChangeStatus}
        onUndo={vi.fn()}
      />,
    );
    const button = screen.getByText("Mark Booked");
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Buyer name"), {
      target: { value: "  Rajesh Shah  " },
    });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onChangeStatus).toHaveBeenCalledWith("booked", "Rajesh Shah");
  });

  it("does not show a buyer-name input for transitions other than booking", () => {
    render(
      <PlotStatusActions
        plot={{ ...basePlot, status: "booked" }}
        history={[historyRow({ status: "booked" })]}
        actor="test-actor-a"
        saving={false}
        onChangeStatus={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByPlaceholderText("Buyer name")).not.toBeInTheDocument();
    expect(screen.getByText("Mark Registry done")).toBeInTheDocument();
  });
});
