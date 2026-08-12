import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlotTransition } from "./applyPlotTransition.ts";
import { getBrowserDbClient } from "../db/browserClient.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";
import { fetchPlotHistory } from "../db/plotHistory.ts";
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
      actor: "test-actor",
    });

    expect(result).toEqual({ ok: false, reason: "illegal_transition" });
    expect(rpcCalled).toBe(false);
  });
});

// Real integration tests against the live local Supabase instance (Docker must be up —
// same requirement as `pnpm import:seed`). Each test creates its own scratch colony/plot
// with a random suffix; these tables have no delete grant (M2), so scratch rows are
// harmless residue in the local dev DB, cleared whenever `supabase db reset` next runs.
async function createScratchPlot(client: SupabaseClient): Promise<{
  plotId: string;
  colonyId: string;
  svgId: string;
}> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-m4-${suffix}`;
  const svgId = `plot-A-${suffix.slice(0, 8)}`;
  await insertColony(client, { id: colonyId, name: "M4 scratch colony", verified: false });
  const [plot] = await insertPlots(client, [
    {
      colony_id: colonyId,
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
  it("success path: status, version, and history all update together", async () => {
    const client = getBrowserDbClient();
    const { plotId } = await createScratchPlot(client);

    const result = await applyPlotTransition(client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      actor: "test-actor-a",
    });

    expect(result.ok).toBe(true);
    const plot = (result as { ok: true; plot: PlotRow }).plot;
    expect(plot.status).toBe("booked");
    expect(plot.version).toBe(2);
    expect(plot.updated_by).toBe("test-actor-a");

    const history = await fetchPlotHistory(client, plotId);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("booked");
    expect(history[0].changed_by).toBe("test-actor-a");
  });

  it("concurrent conflicting writes: one wins, one fails named", async () => {
    const client = getBrowserDbClient();
    const { plotId } = await createScratchPlot(client);

    const [a, b] = await Promise.allSettled([
      applyPlotTransition(client, {
        plotId,
        fromStatus: "available",
        toStatus: "booked",
        expectedVersion: 1,
        actor: "test-actor-a",
      }),
      applyPlotTransition(client, {
        plotId,
        fromStatus: "available",
        toStatus: "booked",
        expectedVersion: 1,
        actor: "test-actor-b",
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
  });

  it("double-tap Save: second call with the same stale version is a named conflict, exactly one history row", async () => {
    const client = getBrowserDbClient();
    const { plotId } = await createScratchPlot(client);

    const first = await applyPlotTransition(client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      actor: "test-actor-a",
    });
    const second = await applyPlotTransition(client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
      actor: "test-actor-a",
    });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, reason: "conflict" });

    const history = await fetchPlotHistory(client, plotId);
    expect(history).toHaveLength(1);
  });

  it("forced mid-transaction failure: the plot update rolls back with the failed history insert", async () => {
    const client = getBrowserDbClient();
    const { plotId, colonyId, svgId } = await createScratchPlot(client);

    // Bypasses both TS wrappers on purpose. A null actor would fail the plots UPDATE
    // itself (updated_by is not null) without ever reaching the history insert — this
    // needs a failure that hits *only* the second statement. p_note is written only to
    // plot_history, so an over-length note (see the plot_history_note_length constraint
    // added in this migration) fails after the plots UPDATE has already run.
    const { error } = await client.rpc("apply_plot_transition", {
      p_plot_id: plotId,
      p_expected_version: 1,
      p_new_status: "booked",
      p_actor: "test-actor-a",
      p_note: "x".repeat(501),
    });
    expect(error).not.toBeNull();

    const { fetchPlotBySvgId } = await import("../db/plots.ts");
    const plot = await fetchPlotBySvgId(client, colonyId, svgId);

    expect(plot?.status).toBe("available");
    expect(plot?.version).toBe(1);
    const history = await fetchPlotHistory(client, plotId);
    expect(history).toHaveLength(0);
  });
});
