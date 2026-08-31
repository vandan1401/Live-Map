import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlotTableView } from "./PlotTableView.tsx";
import type { PlotRow } from "../../lib/db/types.ts";

afterEach(() => {
  cleanup();
});

const plot: PlotRow = {
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

// Same Proxy-chain stub as ColonyMap.test.tsx — these tests assert on load/render
// behaviour, not live sync, so a real client (and Docker) isn't needed.
function createFakeSupabaseClient(rows: PlotRow[]): SupabaseClient {
  const chain: unknown = new Proxy(function chain() {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return chain;
    },
    apply() {
      return chain;
    },
  });
  return {
    from: () => chain,
    channel: () => chain,
    removeChannel: () => {},
  } as unknown as SupabaseClient;
}

describe("PlotTableView", () => {
  it("renders one row per plot with the full column set", async () => {
    render(
      <PlotTableView client={createFakeSupabaseClient([plot])} colonyId="shree-vatika-2" onBack={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText("A-1")).toBeInTheDocument());
    expect(screen.getByText("Plot")).toBeInTheDocument();
    expect(screen.getByText("Updated by")).toBeInTheDocument();
  });

  it("offers the import-data entry point", async () => {
    render(
      <PlotTableView client={createFakeSupabaseClient([plot])} colonyId="shree-vatika-2" onBack={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Import initial data (CSV)")).toBeInTheDocument(),
    );
  });
});
