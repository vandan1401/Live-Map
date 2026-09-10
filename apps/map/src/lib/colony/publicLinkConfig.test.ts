import { describe, expect, it } from "vitest";
import { resolvePublicLinkStatusToggle } from "./publicLinkConfig.ts";

describe("resolvePublicLinkStatusToggle", () => {
  it("defaults to false (no toggle offered) for a colony with no config entry", () => {
    expect(resolvePublicLinkStatusToggle("shree-vatika-2")).toBe(false);
  });

  it("defaults to false for a null colonyId", () => {
    expect(resolvePublicLinkStatusToggle(null)).toBe(false);
  });
});
