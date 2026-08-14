import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ColonyPicker } from "./ColonyPicker.tsx";
import type { ColonyRow } from "../../lib/db/types.ts";

afterEach(() => {
  cleanup();
});

function colonyRow(overrides: Partial<ColonyRow>): ColonyRow {
  return {
    id: "shree-vatika-2",
    name: "Shree Vatika Phase 2",
    verified: true,
    source_file: null,
    generated: null,
    created_at: new Date("2020-01-01").toISOString(),
    ...overrides,
  };
}

describe("ColonyPicker", () => {
  it("renders every colony's name and calls onSelect with its id when clicked", () => {
    const colonies = [
      colonyRow({ id: "shree-vatika-2", name: "Shree Vatika Phase 2" }),
      colonyRow({ id: "another-colony", name: "Another Colony" }),
    ];
    const onSelect = vi.fn();

    render(<ColonyPicker colonies={colonies} onSelect={onSelect} />);

    expect(screen.getByText("Shree Vatika Phase 2")).toBeTruthy();
    expect(screen.getByText("Another Colony")).toBeTruthy();

    fireEvent.click(screen.getByText("Another Colony"));
    expect(onSelect).toHaveBeenCalledWith("another-colony");
  });

  it("shows an empty-state message when there are no colonies", () => {
    render(<ColonyPicker colonies={[]} onSelect={vi.fn()} />);

    expect(screen.getByText("No colonies yet.")).toBeTruthy();
  });

  it("shows the freshness label when the list came from the offline cache", () => {
    render(
      <ColonyPicker
        colonies={[colonyRow({})]}
        onSelect={vi.fn()}
        freshnessLabel="Offline — last synced 3h ago"
      />,
    );

    expect(screen.getByText("Offline — last synced 3h ago")).toBeTruthy();
  });

  it("renders no freshness label for a live (non-cached) list", () => {
    render(<ColonyPicker colonies={[colonyRow({})]} onSelect={vi.fn()} />);

    expect(screen.queryByText(/last synced/)).toBeNull();
  });

  it("shows the freshness label alongside the empty state (/review finding #3)", () => {
    render(<ColonyPicker colonies={[]} onSelect={vi.fn()} freshnessLabel="Offline — last synced 3h ago" />);

    expect(screen.getByText("No colonies yet.")).toBeTruthy();
    expect(screen.getByText("Offline — last synced 3h ago")).toBeTruthy();
  });
});
