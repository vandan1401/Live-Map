import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlotTransition } from "./applyPlotTransition.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";
import { fetchPlotHistory } from "../db/plotHistory.ts";
import {
  createScratchOrg,
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../auth/testHelpers.ts";
import type { PlotRow } from "../db/types.ts";

describe("applyPlotTransition — illegal transition short-circuits", () => {
  it("never calls the database for an illegal transition", async () => {
    let rpcCalled = false;
    const spyClient = {
      rpc: () => {
        rpcCalled = true;
        throw new Error("should not be called");
      },
    } as unknown as SupabaseClient;

    const result = await applyPlotTransition(spyClient, {
      plotId: "irrelevant",
      fromStatus: "registered",
      toStatus: "booked",
      expectedVersion: 1,
    });

    expect(result).toEqual({ ok: false, reason: "illegal_transition" });
    expect(rpcCalled).toBe(false);
  });
});

// Real integration tests against the live local Supabase instance (Docker must be up —
// same requirement as `pnpm import:seed`). Each test creates its own scratch colony/plot
// via the service-role client (docs/plans/09.md — anon/authenticated have no insert
// grant since the M8 RLS lockdown); harmless residue, cleared on the next `db reset`.
async function createScratchPlot(client: SupabaseClient, orgId: string): Promise<{
  plotId: string;
  colonyId: string;
  svgId: string;
}> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-m4-${suffix}`;
  const svgId = `plot-A-${suffix.slice(0, 8)}`;
  await insertColony(client, {
    id: colonyId,
    org_id: orgId,
    name: "M4 scratch colony",
    verified: false,
    svg: "<svg></svg>",
  });
  const [plot] = await insertPlots(client, [
    {
      colony_id: colonyId,
      org_id: orgId,
      svg_id: svgId,
      block: "A",
      number: "1",
      area_sqft: 1200,
      length_ft: 30,
      breadth_ft: 40,
      facing: "north",
      is_corner: false,
      status: "available",
      updated_by: "test-setup",
    },
  ]);
  return { plotId: plot.id, colonyId, svgId };
}

describe("applyPlotTransition — live integration", () => {
  // One pair of scratch users shared across every test here (docs/plans/09.md /review
  // finding — per-test create+delete leaked accounts on a failing assertion and
  // multiplied Auth-container contention). Safe to share: no test depends on another's
  // user state, only its own scratch plot.
  let userA: ScratchUser;
  let userB: ScratchUser;
  let orgId: string;
  beforeAll(async () => {
    orgId = await createScratchOrg();
    [userA, userB] = await Promise.all([
      createScratchUser("Test Actor A", orgId),
      createScratchUser("Test Actor B", orgId),
    ]);
  }, 15_000);
  afterAll(async () => {
    await Promise.all([deleteScratchUser(userA), deleteScratchUser(userB)]);
  });

  it("success path: status, version, and history all update together, attributed to the real signed-in session (D-020)", async () => {
    const admin = serviceRoleClient();
    const { plotId } = await createScratchPlot(admin, orgId);

    const result = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
    });

    expect(result.ok).toBe(true);
    const plot = (result as { ok: true; plot: PlotRow }).plot;
    expect(plot.status).toBe("booked");
    expect(plot.version).toBe(2);
    // No actor field exists to forge (spec/08 criterion 4, more in rls.test.ts).
    expect(plot.updated_by).toBe("Test Actor A");

    const history = await fetchPlotHistory(userA.client, plotId);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("booked");
    expect(history[0].changed_by).toBe("Test Actor A");
  });

  it("concurrent conflicting writes: one wins, one fails named with the real winner's session name", async () => {
    const admin = serviceRoleClient();
    const { plotId } = await createScratchPlot(admin, orgId);

    const [a, b] = await Promise.allSettled([
      applyPlotTransition(userA.client, {
        plotId,
        fromStatus: "available",
        toStatus: "booked",
        expectedVersion: 1,
      }),
      applyPlotTransition(userB.client, {
        plotId,
        fromStatus: "available",
        toStatus: "booked",
        expectedVersion: 1,
      }),
    ]);

    const results = [a, b].map((settled) =>
      settled.status === "fulfilled" ? settled.value : null,
    );
    const wins = results.filter((r) => r?.ok === true);
    const conflicts = results.filter((r) => r?.ok === false && r.reason === "conflict");

    expect(wins).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    const winnerName = (wins[0] as { ok: true; plot: PlotRow }).plot.updated_by;
    expect((conflicts[0] as { ok: false; reason: "conflict"; winnerName: string }).winnerName).toBe(
      winnerName,
    );
    expect(["Test Actor A", "Test Actor B"]).toContain(winnerName);
  });

  it("double-tap Save: second call with the same stale version is a named conflict, exactly one history row", async () => {
    const admin = serviceRoleClient();
    const { plotId } = await createScratchPlot(admin, orgId);

    const first = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
    });
    const second = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
    });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, reason: "conflict" });

    const history = await fetchPlotHistory(userA.client, plotId);
    expect(history).toHaveLength(1);
  });

  it("a fresh booking writes owner_name; later transitions that omit it leave it untouched (docs/plans/08.md)", async () => {
    const admin = serviceRoleClient();
    const { plotId } = await createScratchPlot(admin, orgId);

    const booked = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      ownerName: "Rajesh Shah",
    });
    expect(booked.ok).toBe(true);
    expect((booked as { ok: true; plot: PlotRow }).plot.owner_name).toBe("Rajesh Shah");

    const registered = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "booked",
      toStatus: "registered",
      expectedVersion: 2,
    });
    expect(registered.ok).toBe(true);
    expect((registered as { ok: true; plot: PlotRow }).plot.owner_name).toBe("Rajesh Shah");
  });

  it("undo-into-booked restores the correct prior buyer with no owner name supplied", async () => {
    const admin = serviceRoleClient();
    const { plotId } = await createScratchPlot(admin, orgId);

    await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      ownerName: "Rajesh Shah",
    });
    // Accidental un-book — same as PlotStatusActions.tsx's "Mark Available" button,
    // which never supplies an owner name.
    await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "booked",
      toStatus: "available",
      expectedVersion: 2,
    });

    // Undo (PlotStatusActions.tsx's onUndo call site): back into booked, no owner name
    // supplied. owner_name was never cleared by the un-book step above, so the coalesce
    // must land back on "Rajesh Shah" with no name prompt (docs/plans/08.md §3, criterion 4).
    const undone = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 3,
    });
    expect(undone.ok).toBe(true);
    expect((undone as { ok: true; plot: PlotRow }).plot.owner_name).toBe("Rajesh Shah");
  });

  it("forced mid-transaction failure: the plot update rolls back with the failed history insert", async () => {
    const admin = serviceRoleClient();
    const { plotId, colonyId, svgId } = await createScratchPlot(admin, orgId);

    // Bypasses both TS wrappers, calling the RPC directly (5-arg, no p_actor). p_note
    // is written only to plot_history, so an over-length note fails after the plots
    // UPDATE has already run, hitting only the second statement.
    const { error } = await userA.client.rpc("apply_plot_transition", {
      p_plot_id: plotId,
      p_expected_version: 1,
      p_new_status: "booked",
      p_note: "x".repeat(501),
    });
    expect(error).not.toBeNull();

    const { fetchPlotBySvgId } = await import("../db/plots.ts");
    const plot = await fetchPlotBySvgId(userA.client, colonyId, svgId);

    expect(plot?.status).toBe("available");
    expect(plot?.version).toBe(1);
    const history = await fetchPlotHistory(userA.client, plotId);
    expect(history).toHaveLength(0);
  });
});
// An anon (no session) call to apply_plot_transition being rejected outright is covered
// by lib/auth/rls.test.ts, not duplicated here (docs/plans/09.md — kept this file under
// the 250-line cap).
