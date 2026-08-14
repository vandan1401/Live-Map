import { describe, expect, it } from "vitest";
import { loadColonyList, loadSnapshot, saveColonyList, saveSnapshot } from "./offlineCache.ts";
import type { ColonyRow, PlotStatus } from "../lib/db/types.ts";

describe("offlineCache", () => {
  it("round-trips a plot status snapshot for a colony", async () => {
    const statuses: Record<string, PlotStatus> = { "a-1": "available", "a-2": "booked" };

    await saveSnapshot("offline-test-colony-a", statuses);
    const loaded = await loadSnapshot("offline-test-colony-a");

    expect(loaded?.statuses).toEqual(statuses);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("returns null for a colony with no saved snapshot", async () => {
    const loaded = await loadSnapshot("offline-test-colony-never-saved");
    expect(loaded).toBeNull();
  });

  it("round-trips the verified colony list", async () => {
    const colonies: ColonyRow[] = [
      {
        id: "offline-test-colony-a",
        name: "Test Colony A",
        verified: true,
        source_file: null,
        generated: null,
        created_at: new Date("2020-01-01").toISOString(),
      },
    ];

    await saveColonyList(colonies);
    const loaded = await loadColonyList();

    expect(loaded?.colonies).toEqual(colonies);
  });
});
