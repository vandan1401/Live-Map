import { describe, expect, it, vi } from "vitest";

// Own file, not publicLinkConfig.test.ts — vi.mock's module replacement is file-scoped
// (hoisted to the top of the whole file regardless of describe-block placement, same
// isolation reasoning as mapBackdropSurface.test.ts), and that file's other tests need the
// real checked-in publicLink.json (asserting the un-configured default). The real config
// today has bharatkshetra's statusToggle: true (see publicLink.json) but no colony
// exercising the false/absent branch as an explicit override, so this fixture covers both
// directions.
vi.mock("../../config/publicLink.json", () => ({
  default: { "test-colony": { statusToggle: true } },
}));

const { resolvePublicLinkStatusToggle } = await import("./publicLinkConfig.ts");

describe("resolvePublicLinkStatusToggle — override", () => {
  it("respects an explicit statusToggle: true override", () => {
    expect(resolvePublicLinkStatusToggle("test-colony")).toBe(true);
  });

  it("still defaults to false for a colony not in the override config", () => {
    expect(resolvePublicLinkStatusToggle("shree-vatika-2")).toBe(false);
  });
});
