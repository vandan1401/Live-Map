import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatusLegend } from "./StatusLegend.tsx";
import type { ColonyStatus } from "../lib/db/types.ts";

// docs/plans/40.md: the legend is drawn from the colony's own list — label, swatch colour and
// filter key all come from it, so a custom status needs no stylesheet or code change.
const STATUSES: ColonyStatus[] = [
  { key: "available", label: "Available", colour: "#aa8800" },
  { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
];

afterEach(() => cleanup());

describe("StatusLegend", () => {
  it("renders one button per declared status, in order, with its own label", () => {
    render(<StatusLegend active={new Set()} onToggle={vi.fn()} onClear={vi.fn()} statuses={STATUSES} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Available", "Sold to investors"]);
  });

  it("paints each swatch with the status's own colour", () => {
    render(<StatusLegend active={new Set()} onToggle={vi.fn()} onClear={vi.fn()} statuses={STATUSES} />);
    const swatch = screen.getByText("Sold to investors").querySelector(".colony-legend-swatch");
    expect((swatch as HTMLElement).style.background).toBe("rgb(147, 51, 234)"); // #9333ea
  });

  it("toggles the filter by status KEY, and marks an active one pressed", () => {
    const onToggle = vi.fn();
    render(
      <StatusLegend active={new Set(["sold_to_investors"])} onToggle={onToggle} onClear={vi.fn()} statuses={STATUSES} />,
    );
    const investors = screen.getByRole("button", { name: /Sold to investors/ });
    expect(investors.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(investors);
    expect(onToggle).toHaveBeenCalledWith("sold_to_investors");
  });
});
