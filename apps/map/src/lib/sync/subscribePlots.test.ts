// @vitest-environment node
//
// jsdom's global Event class shadows Node's native (undici-backed) one, and realtime-js's
// WebSocket transport does an instanceof check against the latter — cross-realm mismatch
// throws "the 'event' argument must be an instance of Event. Received an instance of
// Event" the moment the socket connects. This file needs no DOM at all (same as
// applyPlotTransition.test.ts's live-integration describe block), so plain node avoids it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribePlotChanges, type SyncConnectionStatus } from "./subscribePlots.ts";
import { applyPlotTransition } from "../plot-status/applyPlotTransition.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";
import {
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../auth/testHelpers.ts";

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
  await insertColony(client, { id: colonyId, name: "M5 scratch colony", verified: false, svg: "<svg></svg>" });
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
  // beforeAll/afterAll (docs/plans/09.md /review finding), not created+deleted inline
  // in the test body — vitest runs afterAll even when the test assertion below throws,
  // so a failing run can no longer leak these accounts.
  let subscriber: ScratchUser;
  let writer: ScratchUser;
  beforeAll(async () => {
    // RLS (docs/plans/09.md): both the subscriber and the writer must be authenticated
    // — anon is filtered to zero rows, and Realtime enforces the same RLS on
    // postgres_changes, so an anon subscriber would never see the event at all.
    [subscriber, writer] = await Promise.all([
      createScratchUser("Subscriber"),
      createScratchUser("Writer"),
    ]);
  }, 15_000);
  afterAll(async () => {
    await Promise.all([deleteScratchUser(subscriber), deleteScratchUser(writer)]);
  });

  it("a write from one client is observed by another", async () => {
    const { plotId, colonyId, svgId } = await createScratchPlot(serviceRoleClient());

    let resolveConnected: () => void;
    const connected = new Promise<void>((resolve) => {
      resolveConnected = resolve;
    });

    const received = await new Promise<{ svgId: string; status: string }>((resolve, reject) => {
      // 20s, not spec's own 2s acceptance bar — a real Docker-local realtime channel's
      // join + WAL delivery time is genuinely variable, and got measurably worse
      // (docs/plans/09.md) once more live-integration test files started creating their
      // own scratch Auth users concurrently, each contending for the same local
      // Supabase Auth/Realtime services. 10s was itself an earlier bump from 5s for the
      // same class of variance — bump the ceiling again rather than chase a moving
      // target with a third value later.
      const timeout = setTimeout(() => reject(new Error("timed out waiting for change")), 20000);
      const unsubscribe = subscribePlotChanges(subscriber.client, colonyId, {
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
          applyPlotTransition(writer.client, {
            plotId,
            fromStatus: "available",
            toStatus: "booked",
            expectedVersion: 1,
          }),
        )
        .catch(reject);
    });

    expect(received).toEqual({ svgId, status: "booked" });
    // Test-level timeout below matches the internal 20s ceiling — vitest's own default
    // (5000ms) would otherwise fire first and misreport Docker/WAL jitter as a bug.
  }, 20_000);

  // docs/plans/10.md — found live in the browser, not by any mocked-client test:
  // ColonyMap's attachSync and PlotTableView both call subscribePlotChanges for the same
  // colony while both are mounted (the table view overlays the map rather than
  // unmounting it). The old topic (`plots-changes-${colonyId}` alone) made the second
  // call's client.channel(topic) return the *same*, already-subscribed channel object as
  // the first, and calling .on() on it threw synchronously — crashing the whole React
  // tree with no error boundary (a white screen). No WAL/timing dependency here, so no
  // long timeout needed: the throw (or lack of one) happens synchronously inside .on().
  it("two simultaneous subscriptions to the same colony do not collide", async () => {
    const { colonyId } = await createScratchPlot(serviceRoleClient());

    let unsubscribeA: (() => void) | undefined;
    let unsubscribeB: (() => void) | undefined;
    expect(() => {
      unsubscribeA = subscribePlotChanges(subscriber.client, colonyId, {
        onChange: () => {},
        onStatusChange: () => {},
      });
      unsubscribeB = subscribePlotChanges(subscriber.client, colonyId, {
        onChange: () => {},
        onStatusChange: () => {},
      });
    }).not.toThrow();

    unsubscribeA?.();
    unsubscribeB?.();
  });
});
