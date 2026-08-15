import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bulkImportInitialPlotData } from "./bulkImportInitialPlotData.ts";
import { applyPlotTransition } from "../plot-status/applyPlotTransition.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots, fetchPlotBySvgId } from "../db/plots.ts";
import { insertPlotHistory, fetchPlotHistory } from "../db/plotHistory.ts";
import {
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../auth/testHelpers.ts";
import type { BulkImportRow } from "../db/types.ts";

// Mirrors scripts/import-seed.ts's actual write shape: a plot inserted with
// updated_by: "import" plus a matching plot_history row — that combination is what makes
// a plot "eligible" for bulk_set_initial_plot_data (docs/plans/10.md §3).
async function createScratchColonyWithImportedPlots(
  client: SupabaseClient,
  svgIds: string[],
): Promise<{ colonyId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-bulk-${suffix}`;
  // verified: false (D-108, invariant 2 — no test file sets this true, matching
  // applyPlotTransition.test.ts/rls.test.ts/subscribePlots.test.ts's own precedent). This
  // RPC and fetchPlotBySvgId/fetchPlotHistory don't gate on colonies.verified, so the
  // tests below need nothing else changed.
  await insertColony(client, { id: colonyId, name: "Bulk import scratch colony", verified: false });
  const inserted = await insertPlots(
    client,
    svgIds.map((svgId, i) => ({
      colony_id: colonyId,
      svg_id: svgId,
      block: "A",
      number: String(i + 1),
      area_sqft: 1200,
      length_ft: 30,
      breadth_ft: 40,
      facing: "north" as const,
      is_corner: false,
      status: "available" as const,
      updated_by: "import",
    })),
  );
  await insertPlotHistory(
    client,
    inserted.map((row) => ({ plot_id: row.id, status: row.status, changed_by: "import", note: "initial load" })),
  );
  return { colonyId };
}

function row(svgId: string, overrides: Partial<BulkImportRow> = {}): BulkImportRow {
  return {
    svg_id: svgId,
    status: "available",
    owner_name: null,
    owner_phone: null,
    broker_name: null,
    rate_paise: null,
    booking_amount_paise: null,
    booking_date: null,
    registry_date: null,
    notes: null,
    ...overrides,
  };
}

describe("bulkImportInitialPlotData — live integration", () => {
  let user: ScratchUser;
  beforeAll(async () => {
    user = await createScratchUser("Test Bulk Importer");
  }, 15_000);
  afterAll(async () => {
    await deleteScratchUser(user);
  });

  it("applies eligible rows and writes attributable history under the bulk_import sentinel", async () => {
    const admin = serviceRoleClient();
    const { colonyId } = await createScratchColonyWithImportedPlots(admin, ["plot-A-1"]);

    const result = await bulkImportInitialPlotData(user.client, colonyId, [
      row("plot-A-1", { status: "booked", owner_name: "Rajesh Shah", rate_paise: 150000000 }),
    ]);

    expect(result.applied).toEqual(["plot-A-1"]);
    expect(result.skipped).toEqual([]);

    const plot = await fetchPlotBySvgId(user.client, colonyId, "plot-A-1");
    expect(plot?.status).toBe("booked");
    expect(plot?.owner_name).toBe("Rajesh Shah");
    expect(plot?.rate_paise).toBe(150000000);
    // Sentinel, not the real signed-in user's name (docs/plans/10.md §3) — the real
    // uploader is recorded in the history note instead.
    expect(plot?.updated_by).toBe("bulk_import");

    const history = await fetchPlotHistory(user.client, plot!.id);
    expect(history).toHaveLength(2); // seed row + this bulk-import row
    expect(history[0].changed_by).toBe("bulk_import");
    expect(history[0].note).toContain("Test Bulk Importer");
  }, 15_000);

  it("skips an unknown svg_id with a named reason and applies the rest", async () => {
    const admin = serviceRoleClient();
    const { colonyId } = await createScratchColonyWithImportedPlots(admin, ["plot-A-1"]);

    const result = await bulkImportInitialPlotData(user.client, colonyId, [
      row("plot-A-1"),
      row("plot-A-does-not-exist"),
    ]);

    expect(result.applied).toEqual(["plot-A-1"]);
    expect(result.skipped).toEqual([{ svgId: "plot-A-does-not-exist", reason: "unknown svg_id" }]);
  }, 15_000);

  it("re-running before any real edit re-applies (the onboarding correction window)", async () => {
    const admin = serviceRoleClient();
    const { colonyId } = await createScratchColonyWithImportedPlots(admin, ["plot-A-1"]);

    const first = await bulkImportInitialPlotData(user.client, colonyId, [
      row("plot-A-1", { status: "booked", owner_name: "Typo Name" }),
    ]);
    expect(first.applied).toEqual(["plot-A-1"]);

    const corrected = await bulkImportInitialPlotData(user.client, colonyId, [
      row("plot-A-1", { status: "booked", owner_name: "Correct Name" }),
    ]);
    expect(corrected.applied).toEqual(["plot-A-1"]);

    const plot = await fetchPlotBySvgId(user.client, colonyId, "plot-A-1");
    expect(plot?.owner_name).toBe("Correct Name");
  }, 15_000);

  it("skips a plot that already has a real operational transition, and never overwrites it", async () => {
    const admin = serviceRoleClient();
    const { colonyId } = await createScratchColonyWithImportedPlots(admin, ["plot-A-1"]);
    const before = await fetchPlotBySvgId(user.client, colonyId, "plot-A-1");

    await applyPlotTransition(user.client, {
      plotId: before!.id,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      ownerName: "Real Buyer",
    });

    const result = await bulkImportInitialPlotData(user.client, colonyId, [
      row("plot-A-1", { status: "registered", owner_name: "Should Not Land" }),
    ]);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ svgId: "plot-A-1", reason: "plot has real activity already" }]);

    const plot = await fetchPlotBySvgId(user.client, colonyId, "plot-A-1");
    expect(plot?.owner_name).toBe("Real Buyer");
    expect(plot?.status).toBe("booked");
  }, 15_000);

  it("an unexpected mid-batch error rolls back the entire call, not just the failing row", async () => {
    const admin = serviceRoleClient();
    const { colonyId } = await createScratchColonyWithImportedPlots(admin, ["plot-A-1", "plot-A-2"]);

    // Bypasses the TS wrapper to send a value jsonb_to_recordset cannot cast to `date` —
    // same "call the RPC directly" precedent as applyPlotTransition.test.ts's forced
    // mid-transaction-failure case.
    const { error } = await user.client.rpc("bulk_set_initial_plot_data", {
      p_colony_id: colonyId,
      p_rows: [
        { svg_id: "plot-A-1", status: "booked" },
        { svg_id: "plot-A-2", status: "booked", booking_date: "not-a-date" },
      ],
    });
    expect(error).not.toBeNull();

    const plot1 = await fetchPlotBySvgId(user.client, colonyId, "plot-A-1");
    expect(plot1?.status).toBe("available");
    expect(plot1?.version).toBe(1);
  }, 15_000);

  it("an anon (unauthenticated) call is rejected", async () => {
    const { createStatelessAnonClient } = await import("../auth/testHelpers.ts");
    const anon = createStatelessAnonClient();
    const { error } = await anon.rpc("bulk_set_initial_plot_data", {
      p_colony_id: "does-not-matter",
      p_rows: [],
    });
    expect(error).not.toBeNull();
  }, 15_000);
});
