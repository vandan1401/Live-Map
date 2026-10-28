import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlotTableRow } from "./PlotTableRow.tsx";
import type { PlotRow } from "../../lib/db/types.ts";
import { resolveColonyStatuses } from "../../lib/colony/colonyStatuses.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";

// docs/plans/40.md: the props now carry the colony's resolved list. A colony that declares none
// resolves to the built-in three with presentation.json's labels/colours — so these tests keep
// asserting exactly the behaviour they always did.
const STATUSES = resolveColonyStatuses(null, resolvePresentationConfig("shree-vatika-2"));

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
  updated_by: "import",
  updated_at: new Date("2020-01-01").toISOString(),
  created_at: new Date("2020-01-01").toISOString(),
};

function renderRow(props: Partial<Parameters<typeof PlotTableRow>[0]> = {}) {
  return render(
    <table>
      <tbody>
        <PlotTableRow
          statuses={STATUSES}
          plot={basePlot}
          pendingStatus={null}
          ownerNameDraft=""
          saving={false}
          conflictWinner={null}
          error={null}
          onPendingStatusChange={vi.fn()}
          onOwnerNameChange={vi.fn()}
          onSave={vi.fn()}
          {...props}
        />
      </tbody>
    </table>,
  );
}

describe("PlotTableRow", () => {
  it("only offers legal next statuses in the dropdown", () => {
    renderRow();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Available", "Booked"]);
  });

  it("shows no Save button until a status is actually changed", () => {
    renderRow();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("shows a disabled Save button for a fresh booking until a buyer name is entered", () => {
    const onOwnerNameChange = vi.fn();
    renderRow({ pendingStatus: "booked", onOwnerNameChange });
    expect(screen.getByText("Save")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Buyer name"), {
      target: { value: "Rajesh Shah" },
    });
    expect(onOwnerNameChange).toHaveBeenCalledWith("Rajesh Shah");
  });

  it("enables Save once a buyer name draft is present for a fresh booking", () => {
    renderRow({ pendingStatus: "booked", ownerNameDraft: "Rajesh Shah" });
    expect(screen.getByText("Save")).not.toBeDisabled();
  });

  it("does not show a buyer-name input for a plot that is already booked", () => {
    renderRow({ plot: { ...basePlot, status: "booked", owner_name: "Existing Buyer" } });
    expect(screen.queryByPlaceholderText("Buyer name")).not.toBeInTheDocument();
    expect(screen.getByText("Existing Buyer")).toBeInTheDocument();
  });

  it("enables Save with no name requirement for a non-booking transition", () => {
    renderRow({ plot: { ...basePlot, status: "booked" }, pendingStatus: "registered" });
    expect(screen.getByText("Save")).not.toBeDisabled();
  });

  it("calls onSave when Save is clicked", () => {
    const onSave = vi.fn();
    renderRow({ pendingStatus: "booked", ownerNameDraft: "Rajesh Shah", onSave });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows a conflict message inline without touching other rows", () => {
    renderRow({ conflictWinner: "Vikas" });
    expect(screen.getByText(/Vikas changed this a few minutes ago/)).toBeInTheDocument();
  });

  it("shows a save error inline (docs/plans/10.md /review finding — no silent lockup)", () => {
    renderRow({ error: "Could not save this change." });
    expect(screen.getByText("Could not save this change.")).toBeInTheDocument();
  });

  it("disables the status select and owner input while saving", () => {
    renderRow({ pendingStatus: "booked", saving: true });
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByPlaceholderText("Buyer name")).toBeDisabled();
  });
});
