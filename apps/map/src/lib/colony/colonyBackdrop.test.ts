import { afterAll, describe, expect, it } from "vitest";
import { uploadColonyBackdropImage, updateColonyBackdropTransform, isJpegBuffer } from "./colonyBackdrop.ts";
import { createScratchOrg, serviceRoleClient } from "../auth/testHelpers.ts";
import { insertColony, fetchColonyById } from "../db/colonies.ts";

describe("isJpegBuffer", () => {
  it("accepts a real JPEG magic number", () => {
    expect(isJpegBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  it("rejects a PNG magic number", () => {
    expect(isJpegBuffer(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it("rejects an empty buffer", () => {
    expect(isJpegBuffer(new Uint8Array([]))).toBe(false);
  });
});

// docs/plans/29.md: live-integration proof against the real local Docker Supabase (this
// repo's convention, same as publicColony.test.ts/actions.test.ts) — no mocks. Requires the
// colony-backdrops Storage bucket to exist (20260912000000_colony_backdrop_storage.sql).
const createdColonyIds: string[] = [];

afterAll(async () => {
  if (createdColonyIds.length === 0) return;
  const admin = serviceRoleClient();
  // Same convention as publicColony.test.ts's cleanup: colonies/plots carry no DELETE
  // grant for any client role by design (invariant 4) — leaving scratch rows unverified is
  // enough, they simply never appear in any real list again.
  const { error } = await admin.from("colonies").update({ verified: false }).in("id", createdColonyIds);
  if (error) throw new Error(`cleanup failed to unverify scratch colonies: ${error.message}`);
});

// A tiny, real, valid 1x1 JPEG (the smallest fixture that still starts with the real FF D8
// FF magic bytes a real camera/export tool would produce) — base64, decoded to bytes below.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

async function scratchColony() {
  const admin = serviceRoleClient();
  const orgId = await createScratchOrg();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-backdrop-${suffix}`;
  createdColonyIds.push(colonyId);
  await insertColony(admin, {
    id: colonyId,
    org_id: orgId,
    name: "Backdrop Scratch Colony",
    verified: false,
    svg: `<svg></svg>`,
  });
  return { admin, colonyId };
}

describe("uploadColonyBackdropImage", () => {
  it("uploads to Storage and records the three image columns, leaving transform untouched", async () => {
    const { admin, colonyId } = await scratchColony();
    const bytes = Buffer.from(TINY_JPEG_BASE64, "base64");

    await uploadColonyBackdropImage(admin, colonyId, { bytes, imageWidth: 1, imageHeight: 1 });

    const row = await fetchColonyById(admin, colonyId);
    expect(row?.backdrop_storage_path).toBe(`${colonyId}.jpg`);
    expect(row?.backdrop_image_width).toBe(1);
    expect(row?.backdrop_image_height).toBe(1);
    // Untouched defaults from the migration — a first upload must not set these.
    expect(row?.backdrop_transform_scale).toBe(1);
    expect(row?.backdrop_enabled_on_admin).toBe(false);
  }, 15_000);

  it("a re-upload replaces the image but never resets a previously-tuned alignment", async () => {
    const { admin, colonyId } = await scratchColony();
    const bytes = Buffer.from(TINY_JPEG_BASE64, "base64");

    await uploadColonyBackdropImage(admin, colonyId, { bytes, imageWidth: 1, imageHeight: 1 });
    await updateColonyBackdropTransform(admin, colonyId, {
      x: 100,
      y: 200,
      scale: 0.5,
      rotateDeg: 3,
      darkenAlpha: 0.7,
      enabledOnAdmin: true,
      enabledOnPublic: true,
      attribution: "OpenStreetMap contributors (ODbL)",
    });

    await uploadColonyBackdropImage(admin, colonyId, { bytes, imageWidth: 2, imageHeight: 2 });

    const row = await fetchColonyById(admin, colonyId);
    expect(row?.backdrop_image_width).toBe(2);
    expect(row?.backdrop_image_height).toBe(2);
    expect(row?.backdrop_transform_x).toBe(100);
    expect(row?.backdrop_transform_scale).toBe(0.5);
    expect(row?.backdrop_enabled_on_admin).toBe(true);
  }, 15_000);
});

describe("updateColonyBackdropTransform", () => {
  it("updates all 8 fields together", async () => {
    const { admin, colonyId } = await scratchColony();

    await updateColonyBackdropTransform(admin, colonyId, {
      x: 10,
      y: 20,
      scale: 2,
      rotateDeg: 5,
      darkenAlpha: 0.3,
      enabledOnAdmin: true,
      enabledOnPublic: false,
      attribution: "OpenStreetMap contributors (ODbL)",
    });

    const row = await fetchColonyById(admin, colonyId);
    expect(row?.backdrop_transform_x).toBe(10);
    expect(row?.backdrop_transform_y).toBe(20);
    expect(row?.backdrop_transform_scale).toBe(2);
    expect(row?.backdrop_transform_rotate_deg).toBe(5);
    expect(row?.backdrop_darken_alpha).toBe(0.3);
    expect(row?.backdrop_enabled_on_admin).toBe(true);
    expect(row?.backdrop_enabled_on_public).toBe(false);
    expect(row?.backdrop_attribution).toBe("OpenStreetMap contributors (ODbL)");
  }, 15_000);

  it("an empty attribution is a valid value, not an error", async () => {
    const { admin, colonyId } = await scratchColony();

    await updateColonyBackdropTransform(admin, colonyId, {
      x: 0,
      y: 0,
      scale: 1,
      rotateDeg: 0,
      darkenAlpha: 0,
      enabledOnAdmin: false,
      enabledOnPublic: false,
      attribution: "",
    });

    const row = await fetchColonyById(admin, colonyId);
    expect(row?.backdrop_attribution).toBe("");
  }, 15_000);
});

// docs/plans/30.md: the authenticated-(non-service-role)-client cross-org RLS proof lives in
// colonyBackdropRls.test.ts, its own file (invariant 7 — this file was over 250 lines with
// it inline).
