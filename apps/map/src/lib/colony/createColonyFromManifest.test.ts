import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createColonyFromManifest } from "./createColonyFromManifest.ts";
import { applyPlotTransition } from "../plot-status/applyPlotTransition.ts";
import { fetchColonyById } from "../db/colonies.ts";
import { fetchPlotBySvgId, fetchPlotsByColony } from "../db/plots.ts";
import { fetchRecentHistoryForPlots } from "../db/plotHistory.ts";
import {
  createScratchOrg,
  createScratchUser,
  createStatelessAnonClient,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../auth/testHelpers.ts";
import type { ColonyManifest, ColonyManifestPlot } from "../db/types.ts";

// create_colony_from_manifest always sets verified: true (D-025) — every colony this file
// creates would otherwise sit permanently in the real ColonyPicker's list, since
// colonies/plots have no DELETE grant and plot_history's BEFORE DELETE trigger rejects
// any attempt (/review finding: 15 leaked "Test Upload Colony" rows found live after one
// run). Every colonyId this file generates gets pushed here and flipped back to
// verified: false in afterAll — same shape as bulk_set_initial_plot_data's own
// live-integration precedent, minus the delete step that table's rows don't need.
const createdColonyIds: string[] = [];
function newColonyId(): string {
  const id = `test-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdColonyIds.push(id);
  return id;
}

function plot(svgId: string, overrides: Partial<ColonyManifestPlot> = {}): ColonyManifestPlot {
  return {
    svg_id: svgId,
    block: "A",
    number: svgId.split("-").pop()!,
    area_sqft: 1200,
    length_ft: 30,
    breadth_ft: 40,
    facing: "north",
    is_corner: false,
    ...overrides,
  };
}

function manifest(colonyId: string, plots: ColonyManifestPlot[]): ColonyManifest {
  return {
    colony: {
      id: colonyId,
      name: "Test Upload Colony",
      verified: false,
      generated: "2026-08-17",
      source: { file: "test.dxf" },
    },
    plots,
  };
}

const SVG = `<svg><path id="plot-A-01"/></svg>`;

describe("createColonyFromManifest — live integration", () => {
  let user: ScratchUser;
  beforeAll(async () => {
    user = await createScratchUser("Test Colony Uploader", await createScratchOrg());
  }, 15_000);
  afterAll(async () => {
    await deleteScratchUser(user);
    if (createdColonyIds.length > 0) {
      const admin = serviceRoleClient();
      const { error } = await admin.from("colonies").update({ verified: false }).in("id", createdColonyIds);
      if (error) throw new Error(`cleanup failed to unverify scratch colonies: ${error.message}`);
    }
  });

  it("creates a colony with verified: true and plots seeded under the import sentinel", async () => {
    const colonyId = newColonyId();
    const result = await createColonyFromManifest(
      user.client,
      manifest(colonyId, [plot("plot-A-01")]),
      SVG,
      false,
    );
    expect(result).toEqual({ ok: true, colonyId });

    const colony = await fetchColonyById(user.client, colonyId);
    expect(colony?.verified).toBe(true);
    expect(colony?.svg).toBe(SVG);

    const plots = await fetchPlotsByColony(user.client, colonyId);
    expect(plots).toHaveLength(1);
    expect(plots[0].status).toBe("available");
    expect(plots[0].updated_by).toBe("import");
  }, 15_000);

  it("round-trips select_zoom_ref_width_px/height_px when the manifest has select_zoom (docs/plans/20.md)", async () => {
    const colonyId = newColonyId();
    const withZoomRef = manifest(colonyId, [plot("plot-A-01")]);
    withZoomRef.colony.select_zoom = { ref_width_px: 340, ref_height_px: 238 };

    const result = await createColonyFromManifest(user.client, withZoomRef, SVG, false);
    expect(result).toEqual({ ok: true, colonyId });

    const colony = await fetchColonyById(user.client, colonyId);
    expect(colony?.select_zoom_ref_width_px).toBe(340);
    expect(colony?.select_zoom_ref_height_px).toBe(238);
  }, 15_000);

  it("leaves select_zoom_ref_width_px/height_px null when the manifest has no select_zoom", async () => {
    const colonyId = newColonyId();
    const result = await createColonyFromManifest(
      user.client,
      manifest(colonyId, [plot("plot-A-01")]),
      SVG,
      false,
    );
    expect(result).toEqual({ ok: true, colonyId });

    const colony = await fetchColonyById(user.client, colonyId);
    expect(colony?.select_zoom_ref_width_px).toBeNull();
    expect(colony?.select_zoom_ref_height_px).toBeNull();
  }, 15_000);

  it("refuses to re-create an existing colony id without replace", async () => {
    const colonyId = newColonyId();
    await createColonyFromManifest(user.client, manifest(colonyId, [plot("plot-A-01")]), SVG, false);

    const result = await createColonyFromManifest(
      user.client,
      manifest(colonyId, [plot("plot-A-01")]),
      SVG,
      false,
    );
    expect(result).toEqual({ ok: false, reason: "colony_exists" });
  }, 15_000);

  it("replace updates only geometry columns on an existing plot, never status/owner", async () => {
    const colonyId = newColonyId();
    await createColonyFromManifest(user.client, manifest(colonyId, [plot("plot-A-01")]), SVG, false);
    const before = await fetchPlotBySvgId(user.client, colonyId, "plot-A-01");
    await applyPlotTransition(user.client, {
      plotId: before!.id,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      ownerName: "Real Buyer",
    });

    const result = await createColonyFromManifest(
      user.client,
      manifest(colonyId, [plot("plot-A-01", { area_sqft: 1500, block: "B" })]),
      SVG,
      true,
    );
    expect(result).toEqual({ ok: true, colonyId });

    const after = await fetchPlotBySvgId(user.client, colonyId, "plot-A-01");
    expect(after?.area_sqft).toBe(1500);
    expect(after?.block).toBe("B");
    // Operational state from the real transition must survive the replace untouched.
    expect(after?.status).toBe("booked");
    expect(after?.owner_name).toBe("Real Buyer");
    expect(after?.updated_by).not.toBe("import");
  }, 15_000);

  it("refuses a replace that would drop an existing plot's history, writing nothing", async () => {
    const colonyId = newColonyId();
    await createColonyFromManifest(
      user.client,
      manifest(colonyId, [plot("plot-A-01"), plot("plot-A-02")]),
      `<svg><path id="plot-A-01"/><path id="plot-A-02"/></svg>`,
      false,
    );

    const result = await createColonyFromManifest(
      user.client,
      manifest(colonyId, [plot("plot-A-01")]),
      SVG,
      true,
    );
    expect(result).toEqual({
      ok: false,
      reason: "would_orphan_history",
      missingSvgIds: ["plot-A-02"],
    });

    // Nothing written — the colony row and both plots are untouched.
    const plots = await fetchPlotsByColony(user.client, colonyId);
    expect(plots).toHaveLength(2);
  }, 15_000);

  it("seeded plot_history rows never appear in the share summary's recent changes", async () => {
    const colonyId = newColonyId();
    await createColonyFromManifest(user.client, manifest(colonyId, [plot("plot-A-01")]), SVG, false);
    const created = await fetchPlotBySvgId(user.client, colonyId, "plot-A-01");

    const recent = await fetchRecentHistoryForPlots(user.client, [created!.id], 50);
    expect(recent).toEqual([]);
  }, 15_000);

  it("an anon (unauthenticated) call is rejected", async () => {
    const anon = createStatelessAnonClient();
    const { error } = await anon.rpc("create_colony_from_manifest", {
      p_colony_id: "does-not-matter",
      p_colony_name: "x",
      p_source_file: "x",
      p_generated: "2026-08-17",
      p_svg: "<svg></svg>",
      p_plots: [],
      p_replace: false,
    });
    // Distinguishes "no execute grant" from an unrelated failure (renamed parameter,
    // schema-cache miss) — same PERMISSION_DENIED precedent as rls.test.ts and
    // bulkImportInitialPlotData.test.ts's own anon case (/review finding: a bare
    // `not.toBeNull()` also passes for the RPC's own `not authenticated` exception, so it
    // proves nothing about the execute grant specifically).
    expect(error?.code).toBe("42501");
  }, 15_000);
});
