import { describe, expect, it } from "vitest";
import { resolveMapBackdropFromRow, type ColonyBackdropFields } from "./mapBackdrops.ts";

// docs/plans/29.md: covers the enabledOnAdmin/enabledOnPublic gate (docs/plans/28.md
// Backlog #1, 2026-09-09) against an explicit fixture row — one flag false, the other true.
function fakeClient() {
  return {
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://example.test/x.jpg" } }) }),
    },
  } as unknown as Parameters<typeof resolveMapBackdropFromRow>[0];
}

const ROW: ColonyBackdropFields = {
  id: "bharatkshetra",
  backdrop_storage_path: "bharatkshetra.jpg",
  backdrop_image_width: 100,
  backdrop_image_height: 100,
  backdrop_transform_x: 0,
  backdrop_transform_y: 0,
  backdrop_transform_scale: 1,
  backdrop_transform_rotate_deg: 0,
  backdrop_darken_alpha: 0.5,
  backdrop_enabled_on_admin: false,
  backdrop_enabled_on_public: true,
  backdrop_attribution: "",
};

describe("resolveMapBackdropFromRow — per-surface on/off", () => {
  it("returns null on the surface whose flag is false", () => {
    expect(resolveMapBackdropFromRow(fakeClient(), ROW, "admin")).toBeNull();
  });

  it("still returns the backdrop on the surface whose flag is true", () => {
    expect(resolveMapBackdropFromRow(fakeClient(), ROW, "public")).not.toBeNull();
  });
});
