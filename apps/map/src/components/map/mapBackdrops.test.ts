import { describe, expect, it } from "vitest";
import { resolveMapBackdropFromRow, type ColonyBackdropFields } from "./mapBackdrops.ts";

// docs/plans/29.md: resolveMapBackdrop's Record-lookup replaced by resolveMapBackdropFromRow,
// which takes an already-loaded colony row plus a client (for getPublicUrl — a pure string
// build, no network call, so a minimal fake client is enough here).
function fakeClient(publicUrl: string) {
  return {
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl } }),
      }),
    },
  } as unknown as Parameters<typeof resolveMapBackdropFromRow>[0];
}

function bharatkshetraRow(overrides: Partial<ColonyBackdropFields> = {}): ColonyBackdropFields {
  return {
    id: "bharatkshetra",
    backdrop_storage_path: "bharatkshetra.jpg",
    backdrop_image_width: 1798,
    backdrop_image_height: 875,
    backdrop_transform_x: 864,
    backdrop_transform_y: 283,
    backdrop_transform_scale: 0.105,
    backdrop_transform_rotate_deg: 0,
    backdrop_darken_alpha: 0.65,
    backdrop_enabled_on_admin: true,
    backdrop_enabled_on_public: true,
    backdrop_attribution: "OpenStreetMap contributors (ODbL)",
    ...overrides,
  };
}

describe("resolveMapBackdropFromRow", () => {
  it("returns the backdrop with its labels, on both surfaces", () => {
    const client = fakeClient("https://example.test/colony-backdrops/bharatkshetra.jpg");
    for (const surface of ["admin", "public"] as const) {
      const backdrop = resolveMapBackdropFromRow(client, bharatkshetraRow(), surface);
      expect(backdrop).not.toBeNull();
      expect(backdrop?.data.imageWidth).toBe(1798);
      expect(backdrop?.data.imageHeight).toBe(875);
      expect(backdrop?.data.labels).toHaveLength(9);
      expect(backdrop?.url).toBe("https://example.test/colony-backdrops/bharatkshetra.jpg");
    }
  });

  it("returns null for a colony with no matching labels entry (still resolves, empty labels)", () => {
    const client = fakeClient("https://example.test/colony-backdrops/shree-vatika-2.jpg");
    const row = bharatkshetraRow({ id: "shree-vatika-2" });
    const backdrop = resolveMapBackdropFromRow(client, row, "admin");
    expect(backdrop?.data.labels).toEqual([]);
  });

  it("returns null for a null row", () => {
    const client = fakeClient("unused");
    expect(resolveMapBackdropFromRow(client, null, "admin")).toBeNull();
    expect(resolveMapBackdropFromRow(client, null, "public")).toBeNull();
  });

  it("returns null when no image has been uploaded yet (storage path null)", () => {
    const client = fakeClient("unused");
    const row = bharatkshetraRow({ backdrop_storage_path: null, backdrop_image_width: null, backdrop_image_height: null });
    expect(resolveMapBackdropFromRow(client, row, "admin")).toBeNull();
  });
});
