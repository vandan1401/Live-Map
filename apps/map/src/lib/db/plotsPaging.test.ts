import { beforeAll, describe, expect, it } from "vitest";
import { insertColony } from "./colonies.ts";
import { fetchCornerPlotIds, fetchPlotStatuses, fetchPlotsByColony, insertPlots } from "./plots.ts";
import { createScratchOrg, serviceRoleClient } from "../auth/testHelpers.ts";

// Live against the local Docker Supabase, like the rest of lib/db's tests. PostgREST caps
// any one response at max_rows (1000, supabase/config.toml and the hosted default), so a
// colony bigger than that — colony 1599 — silently lost every row past the cap: those
// plots had no entry in the status map and the painter drew them in bare plot-base colour
// next to correctly tinted neighbours. 1599 must come back in full from every fetcher that
// reads a whole colony.
const COLONY_ID = "test-paging-1599";
const PLOT_COUNT = 1599;

describe("whole-colony plot fetchers past the 1000-row API cap", () => {
  beforeAll(async () => {
    const admin = serviceRoleClient();
    const { count } = await admin
      .from("plots")
      .select("id", { count: "exact", head: true })
      .eq("colony_id", COLONY_ID);
    if (count === PLOT_COUNT) return; // fixed id: seeded once, reused by every later run

    const orgId = await createScratchOrg();
    await insertColony(admin, {
      id: COLONY_ID,
      org_id: orgId,
      name: "paging scratch",
      verified: false,
      svg: "<svg></svg>",
    });
    const rows = Array.from({ length: PLOT_COUNT }, (_, i) => ({
      colony_id: COLONY_ID,
      org_id: orgId,
      svg_id: `plot-A-${String(i + 1).padStart(4, "0")}`,
      block: "A",
      number: String(i + 1).padStart(4, "0"),
      area_sqft: 1200,
      length_ft: 30,
      breadth_ft: 40,
      facing: "north" as const,
      is_corner: true,
      status: "available" as const,
      updated_by: "test-setup",
    }));
    for (let i = 0; i < rows.length; i += 400) await insertPlots(admin, rows.slice(i, i + 400));
  }, 60_000);

  it("fetchPlotStatuses returns a status for every plot", async () => {
    const statuses = await fetchPlotStatuses(serviceRoleClient(), COLONY_ID);
    expect(Object.keys(statuses)).toHaveLength(PLOT_COUNT);
  });

  it("fetchPlotsByColony returns every row, in svg_id order", async () => {
    const rows = await fetchPlotsByColony(serviceRoleClient(), COLONY_ID);
    expect(rows).toHaveLength(PLOT_COUNT);
    expect(rows.map((r) => r.svg_id)).toEqual([...rows.map((r) => r.svg_id)].sort());
  });

  it("fetchCornerPlotIds returns every corner plot", async () => {
    const corners = await fetchCornerPlotIds(serviceRoleClient(), COLONY_ID);
    expect(corners.size).toBe(PLOT_COUNT);
  });
});
