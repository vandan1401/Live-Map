import { describe, expect, it, vi } from "vitest";

// Own file, not publicLinkConfig.test.ts — vi.mock's module replacement is file-scoped
// (hoisted to the top of the whole file regardless of describe-block placement, same
// isolation reasoning as mapBackdropSurface.test.ts), and that file's other tests need the
// real checked-in publicLink.json (asserting the un-configured default). The real config
// has no showStatus: false colony yet, so that branch needs a fixture, not shipped data.
vi.mock("../../config/publicLink.json", () => ({
  default: { "test-colony": { showStatus: false } },
}));

const { resolvePublicLinkShowStatus } = await import("./publicLinkConfig.ts");

describe("resolvePublicLinkShowStatus — override", () => {
  it("respects an explicit showStatus: false override", () => {
    expect(resolvePublicLinkShowStatus("test-colony")).toBe(false);
  });

  it("still defaults to true for a colony not in the override config", () => {
    expect(resolvePublicLinkShowStatus("shree-vatika-2")).toBe(true);
  });
});
