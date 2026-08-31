import { describe, expect, it } from "vitest";
import {
  isSnapshotExpired,
  loadColonyList,
  loadSnapshot,
  OFFLINE_CACHE_MAX_AGE_MS,
  saveColonyList,
  saveSnapshot,
} from "./offlineCache.ts";
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
        org_id: "org-test-1",
        name: "Test Colony A",
        verified: true,
        source_file: null,
        generated: null,
        svg: "<svg></svg>",
        created_at: new Date("2020-01-01").toISOString(),
      },
    ];

    await saveColonyList(colonies);
    const loaded = await loadColonyList();

    expect(loaded?.colonies).toEqual(colonies);
  });
});

describe("isSnapshotExpired", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("is not expired well within the 24h window", () => {
    const savedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // 1h ago
    expect(isSnapshotExpired(savedAt, now)).toBe(false);
  });

  it("is not expired exactly at the boundary", () => {
    const savedAt = new Date(now.getTime() - OFFLINE_CACHE_MAX_AGE_MS).toISOString();
    expect(isSnapshotExpired(savedAt, now)).toBe(false);
  });

  it("is expired one millisecond past the boundary", () => {
    const savedAt = new Date(now.getTime() - OFFLINE_CACHE_MAX_AGE_MS - 1).toISOString();
    expect(isSnapshotExpired(savedAt, now)).toBe(true);
  });

  it("is expired well past the 24h window", () => {
    const savedAt = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(); // 72h ago
    expect(isSnapshotExpired(savedAt, now)).toBe(true);
  });
});
