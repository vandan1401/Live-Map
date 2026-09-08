import { describe, expect, it } from "vitest";
import { resolveMapBackdrop } from "./mapBackdrops.ts";

describe("resolveMapBackdrop", () => {
  it("returns the bharatkshetra backdrop with its labels", () => {
    const backdrop = resolveMapBackdrop("bharatkshetra");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.data.imageWidth).toBe(1798);
    expect(backdrop?.data.imageHeight).toBe(875);
    expect(backdrop?.data.labels).toHaveLength(9);
    expect(backdrop?.url).toEqual(expect.any(String));
  });

  it("returns null for a colony with no backdrop entry", () => {
    expect(resolveMapBackdrop("shree-vatika-2")).toBeNull();
  });

  it("returns null for a null colonyId", () => {
    expect(resolveMapBackdrop(null)).toBeNull();
  });
});
