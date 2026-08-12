import { describe, expect, it } from "vitest";
import { isRecentlyEdited, RECENT_EDIT_WARNING_MINUTES } from "./recentEdit.ts";

describe("isRecentlyEdited", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("is true just inside the window", () => {
    const updatedAt = new Date(now.getTime() - (RECENT_EDIT_WARNING_MINUTES - 1) * 60_000);
    expect(isRecentlyEdited(updatedAt.toISOString(), now)).toBe(true);
  });

  it("is false just outside the window", () => {
    const updatedAt = new Date(now.getTime() - (RECENT_EDIT_WARNING_MINUTES + 1) * 60_000);
    expect(isRecentlyEdited(updatedAt.toISOString(), now)).toBe(false);
  });

  it("is false exactly at the boundary", () => {
    const updatedAt = new Date(now.getTime() - RECENT_EDIT_WARNING_MINUTES * 60_000);
    expect(isRecentlyEdited(updatedAt.toISOString(), now)).toBe(false);
  });
});
