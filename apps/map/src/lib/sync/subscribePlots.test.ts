// @vitest-environment node
//
// jsdom's global Event class shadows Node's native (undici-backed) one, and realtime-js's
// WebSocket transport does an instanceof check against the latter — cross-realm mismatch
// throws "the 'event' argument must be an instance of Event. Received an instance of
// Event" the moment the socket connects. This file needs no DOM at all (same as
// applyPlotTransition.test.ts's live-integration describe block), so plain node avoids it.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribePlotChanges, type SyncConnectionStatus } from "./subscribePlots.ts";
import { applyPlotTransition } from "../plot-status/applyPlotTransition.ts";
import { getBrowserDbClient } from "../db/browserClient.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";

// Live integration test against the local Supabase instance (Docker must be up — same
// requirement as applyPlotTransition.test.ts, whose two-independent-client scratch-plot
// pattern this reuses). Proves the plots table is actually in the supabase_realtime
// publication (M5's migration) and that subscribePlotChanges wires postgres_changes
// correctly — a broken filter or channel name fails silently otherwise.
async function createScratchPlot(client: SupabaseClient): Promise<{
  plotId: string;
  colonyId: string;
  svgId: string;
}> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-m5-${suffix}`;
  const svgId = `plot-A-${suffix.slice(0, 8)}`;
  await insertColony(client, { id: colonyId, name: "M5 scratch colony", verified: false });
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

describe("subscribePlotChanges — live integration", () => {
  it("a write from one client is observed by another", async () => {
    const subscriberClient = getBrowserDbClient();
    const writerClient = getBrowserDbClient();
    const { plotId, colonyId, svgId } = await createScratchPlot(subscriberClient);

    let resolveConnected: () => void;
    const connected = new Promise<void>((resolve) => {
      resolveConnected = resolve;
    });

    const received = await new Promise<{ svgId: string; status: string }>((resolve, reject) => {
      // 10s, not spec's own 2s acceptance bar — a real Docker-local realtime channel's
      // join + WAL delivery time is genuinely variable; a run at 5s ceiling was observed
      // to trip the vitest default per-test timeout with the race fix already in place.
      const timeout = setTimeout(() => reject(new Error("timed out waiting for change")), 10000);
      const unsubscribe = subscribePlotChanges(subscriberClient, colonyId, {
        onChange: (changedSvgId, status) => {
          clearTimeout(timeout);
          unsubscribe();
          resolve({ svgId: changedSvgId, status });
        },
        onStatusChange: (status: SyncConnectionStatus) => {
          if (status === "connected") resolveConnected();
        },
      });

      // Wait for the channel to actually join before writing — issuing the write
      // immediately races the subscribe ack against Postgres's WAL delivery. It can
      // pass by luck (a live run showed the RPC commit land before the ack) and flake
      // the moment the join is slower, which would misreport a real regression.
      connected
        .then(() =>
          applyPlotTransition(writerClient, {
            plotId,
            fromStatus: "available",
            toStatus: "booked",
            expectedVersion: 1,
            actor: "test-writer",
          }),
        )
        .catch(reject);
    });

    expect(received).toEqual({ svgId, status: "booked" });
    // Test-level timeout below matches the internal 10s ceiling — vitest's own default
    // (5000ms) would otherwise fire first and misreport Docker/WAL jitter as a bug.
  }, 10_000);
});
