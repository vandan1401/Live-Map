import { describe, expect, it } from "vitest";
import { resolvePublicLinkShowStatus } from "./publicLinkConfig.ts";

describe("resolvePublicLinkShowStatus", () => {
  it("defaults to true for a colony with no config entry", () => {
    expect(resolvePublicLinkShowStatus("shree-vatika-2")).toBe(true);
  });

  it("defaults to true for a null colonyId", () => {
    expect(resolvePublicLinkShowStatus(null)).toBe(true);
  });
});
