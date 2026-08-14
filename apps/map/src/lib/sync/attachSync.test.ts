import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSync } from "./attachSync.ts";
import { saveSnapshot } from "../../pwa/offlineCache.ts";
import type { PlotStatus } from "../db/types.ts";

const { loadPlotStatuses } = vi.hoisted(() => ({ loadPlotStatuses: vi.fn() }));
vi.mock("../colony/plotStatus.ts", () => ({ loadPlotStatuses }));

const { subscribePlotChanges } = vi.hoisted(() => ({ subscribePlotChanges: vi.fn() }));
vi.mock("./subscribePlots.ts", () => ({ subscribePlotChanges }));

const fakeClient = {} as SupabaseClient;
const COLONY_ID = "attach-sync-test-colony";

let onLineDescriptor: PropertyDescriptor | undefined;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

// fake-indexeddb's callbacks run on real setTimeout even though Date is faked below —
// how many ticks that takes varies with machine/suite load (a fixed tick count flaked
// under full-suite contention), so poll instead of guessing a count.
async function waitForCall(mockFn: ReturnType<typeof vi.fn>) {
  await vi.waitFor(
    () => {
      if (mockFn.mock.calls.length === 0) throw new Error("not called yet");
    },
    { timeout: 2000, interval: 10 },
  );
}

describe("attachSync — offline fallback", () => {
  beforeEach(() => {
    onLineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
    subscribePlotChanges.mockReturnValue(vi.fn());
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (onLineDescriptor) Object.defineProperty(navigator, "onLine", onLineDescriptor);
    loadPlotStatuses.mockReset();
    subscribePlotChanges.mockReset();
  });

  it("applies the cached snapshot and reports its real age when the initial fetch fails offline", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const cachedStatuses: Record<string, PlotStatus> = { "a-1": "booked" };
    await saveSnapshot(COLONY_ID, cachedStatuses);

    // 65s later — past the "just now" bucket, so a label reading "1 min ago" proves the
    // snapshot's own savedAt was used, not the moment attachSync happened to run
    // (/review finding: this is exactly the bug class a missing test here would miss).
    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z"));
    setOnline(false);
    loadPlotStatuses.mockRejectedValue(new Error("network down"));

    const applyStatuses = vi.fn();
    const setFreshnessLabel = vi.fn();
    const cleanup = attachSync(fakeClient, COLONY_ID, {
      applyStatuses,
      applyStatus: vi.fn(),
      setOffline: vi.fn(),
      setFreshnessLabel,
    });

    await waitForCall(applyStatuses);

    expect(applyStatuses).toHaveBeenCalledWith(cachedStatuses);
    expect(setFreshnessLabel).toHaveBeenCalledWith("Offline — last synced 1 min ago");

    cleanup();
  });

  it("never lets a stale snapshot overwrite data that already synced (/review finding #3)", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const cachedStatuses: Record<string, PlotStatus> = { "a-1": "booked" };
    await saveSnapshot(COLONY_ID, cachedStatuses);
    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z"));
    setOnline(false);

    // First call is the initial fetch (fails, triggering the offline-snapshot read —
    // real IndexedDB, resolves on a real macrotask). Second call is the reconnect
    // refetch triggered by the "online" dispatch below (resolves immediately, on a
    // microtask) — it lands and calls markSynced() well before the snapshot read's
    // macrotask fires, which is exactly the race the `|| lastSyncedAt` guard exists for.
    const liveStatuses: Record<string, PlotStatus> = { "a-1": "available" };
    loadPlotStatuses.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(liveStatuses);

    const applyStatuses = vi.fn();
    const setFreshnessLabel = vi.fn();
    const cleanup = attachSync(fakeClient, COLONY_ID, {
      applyStatuses,
      applyStatus: vi.fn(),
      setOffline: vi.fn(),
      setFreshnessLabel,
    });

    // Same tick as attachSync's own synchronous setup — before the initial fetch's
    // catch branch has had a chance to run, exactly like a real reconnect racing a
    // real offline read.
    window.dispatchEvent(new Event("online"));

    // The reconnect's applyStatuses call lands fast (an already-resolved mock, a
    // microtask); the slower real-IndexedDB snapshot read (a macrotask, see
    // waitForCall's comment) is the one the guard must have already blocked by the time
    // it resolves — wait past it too before asserting, not just past the first call.
    await waitForCall(applyStatuses);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(applyStatuses).toHaveBeenCalledWith(liveStatuses);
    expect(applyStatuses).not.toHaveBeenCalledWith(cachedStatuses);

    cleanup();
  });
});
