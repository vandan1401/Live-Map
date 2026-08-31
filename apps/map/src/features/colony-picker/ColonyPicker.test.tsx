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
    org_id: "org-test-1",
    name: "Shree Vatika Phase 2",
    verified: true,
    source_file: null,
    generated: null,
    svg: "<svg></svg>",
    created_at: new Date("2020-01-01").toISOString(),
    public_token: null,
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

    render(
      <ColonyPicker colonies={colonies} onSelect={onSelect} onUpload={vi.fn()} onLogout={vi.fn()} />,
    );

    expect(screen.getByText("Nimantran Group Colonies")).toBeTruthy();
    expect(screen.getByText("Shree Vatika Phase 2")).toBeTruthy();
    expect(screen.getByText("Another Colony")).toBeTruthy();

    fireEvent.click(screen.getByText("Another Colony"));
    expect(onSelect).toHaveBeenCalledWith("another-colony");
  });

  it("shows an empty-state message when there are no colonies", () => {
    render(<ColonyPicker colonies={[]} onSelect={vi.fn()} onUpload={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.getByText("Nimantran Group Colonies")).toBeTruthy();
    expect(screen.getByText("No colonies yet.")).toBeTruthy();
  });

  it("calls onUpload when the upload button is clicked", () => {
    const onUpload = vi.fn();
    render(
      <ColonyPicker
        colonies={[colonyRow({})]}
        onSelect={vi.fn()}
        onUpload={onUpload}
        onLogout={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Upload a colony"));
    expect(onUpload).toHaveBeenCalled();
  });

  it("calls onLogout when the log out button is clicked", () => {
    const onLogout = vi.fn();
    render(
      <ColonyPicker
        colonies={[colonyRow({})]}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onLogout={onLogout}
      />,
    );

    fireEvent.click(screen.getByText("Log out"));
    expect(onLogout).toHaveBeenCalled();
  });

  it("shows the freshness label when the list came from the offline cache", () => {
    render(
      <ColonyPicker
        colonies={[colonyRow({})]}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onLogout={vi.fn()}
        freshnessLabel="Offline — last synced 3h ago"
      />,
    );

    expect(screen.getByText("Offline — last synced 3h ago")).toBeTruthy();
  });

  it("renders no freshness label for a live (non-cached) list", () => {
    render(
      <ColonyPicker
        colonies={[colonyRow({})]}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.queryByText(/last synced/)).toBeNull();
  });

  it("shows the freshness label alongside the empty state (/review finding #3)", () => {
    render(
      <ColonyPicker
        colonies={[]}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onLogout={vi.fn()}
        freshnessLabel="Offline — last synced 3h ago"
      />,
    );

    expect(screen.getByText("No colonies yet.")).toBeTruthy();
    expect(screen.getByText("Offline — last synced 3h ago")).toBeTruthy();
  });
});
