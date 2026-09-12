// Split out of colonyBackdrop.test.ts (docs/plans/30.md /review), which had grown past
// invariant 7's 250-line cap once these cases were added — not a separate concern, the same
// live-integration proof, just in its own file for size (same precedent
// rls-cross-org.test.ts already set when it was split out of rls.test.ts for the same
// reason). The acceptance-critical proof this whole plan's security argument rests on — a
// real, signed-in org member (anon key, not service-role) can write their own org's
// backdrop, and is genuinely refused (not just silently no-op'd) for a different org's
// colony or a colony that doesn't exist at all. Mirrors rls-cross-org.test.ts's own
// two-scratch-org shape.
import { afterAll, describe, expect, it } from "vitest";
import { uploadColonyBackdropImage, updateColonyBackdropTransform } from "./colonyBackdrop.ts";
import {
  createScratchOrg,
  createScratchPlot,
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
} from "../auth/testHelpers.ts";
import { fetchColonyById } from "../db/colonies.ts";

// Same tiny, real, valid 1x1 JPEG as colonyBackdrop.test.ts (kept independent rather than
// exported/shared — one literal, two files, cheaper than a shared-fixture import for a
// single base64 string).
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

const createdColonyIds: string[] = [];

afterAll(async () => {
  if (createdColonyIds.length === 0) return;
  const admin = serviceRoleClient();
  const { error } = await admin.from("colonies").update({ verified: false }).in("id", createdColonyIds);
  if (error) throw new Error(`cleanup failed to unverify scratch colonies: ${error.message}`);
});

describe("colonyBackdrop — authenticated (non-service-role) client (docs/plans/30.md)", () => {
  it("uploadColonyBackdropImage: an org member can upload, then replace, their own org's colony backdrop", async () => {
    const orgId = await createScratchOrg();
    const user = await createScratchUser("Backdrop Test User", orgId);
    const { colonyId } = await createScratchPlot(orgId);
    createdColonyIds.push(colonyId);
    const bytes = Buffer.from(TINY_JPEG_BASE64, "base64");

    await uploadColonyBackdropImage(user.client, colonyId, { bytes, imageWidth: 1, imageHeight: 1 });

    const admin = serviceRoleClient();
    const firstRow = await fetchColonyById(admin, colonyId);
    expect(firstRow?.backdrop_storage_path).toBe(`${colonyId}.jpg`);
    expect(firstRow?.backdrop_image_width).toBe(1);

    // The replace path (Storage's UPDATE-on-conflict policy) — not exercised by a single
    // upload above (/review finding, 2026-09-12: "the Storage replace path has no test").
    await uploadColonyBackdropImage(user.client, colonyId, { bytes, imageWidth: 2, imageHeight: 2 });
    const secondRow = await fetchColonyById(admin, colonyId);
    expect(secondRow?.backdrop_image_width).toBe(2);

    await deleteScratchUser(user);
  }, 15_000);

  it("uploadColonyBackdropImage: rejects a different org's colony (Storage RLS)", async () => {
    const [orgA, orgB] = await Promise.all([createScratchOrg(), createScratchOrg()]);
    const userA = await createScratchUser("Org A User", orgA);
    const { colonyId: colonyIdB } = await createScratchPlot(orgB);
    createdColonyIds.push(colonyIdB);
    const bytes = Buffer.from(TINY_JPEG_BASE64, "base64");

    await expect(
      uploadColonyBackdropImage(userA.client, colonyIdB, { bytes, imageWidth: 1, imageHeight: 1 }),
    ).rejects.toThrow();

    const admin = serviceRoleClient();
    const row = await fetchColonyById(admin, colonyIdB);
    expect(row?.backdrop_storage_path).toBeNull();

    await deleteScratchUser(userA);
  }, 15_000);

  it("uploadColonyBackdropImage: rejects a nonexistent colony id (Storage RLS)", async () => {
    const orgId = await createScratchOrg();
    const user = await createScratchUser("Backdrop Test User", orgId);
    const bytes = Buffer.from(TINY_JPEG_BASE64, "base64");

    await expect(
      uploadColonyBackdropImage(user.client, "no-such-colony-id", { bytes, imageWidth: 1, imageHeight: 1 }),
    ).rejects.toThrow();

    await deleteScratchUser(user);
  }, 15_000);

  it("updateColonyBackdropTransform: an org member can update their own org's colony alignment", async () => {
    const orgId = await createScratchOrg();
    const user = await createScratchUser("Backdrop Test User", orgId);
    const { colonyId } = await createScratchPlot(orgId);
    createdColonyIds.push(colonyId);

    await updateColonyBackdropTransform(user.client, colonyId, {
      x: 5,
      y: 6,
      scale: 1.5,
      rotateDeg: 1,
      darkenAlpha: 0.4,
      enabledOnAdmin: true,
      enabledOnPublic: true,
      attribution: "",
    });

    const admin = serviceRoleClient();
    const row = await fetchColonyById(admin, colonyId);
    expect(row?.backdrop_transform_x).toBe(5);
    expect(row?.backdrop_enabled_on_admin).toBe(true);

    await deleteScratchUser(user);
  }, 15_000);

  it("updateColonyBackdropTransform: rejects a different org's colony, not a silent no-op", async () => {
    const [orgA, orgB] = await Promise.all([createScratchOrg(), createScratchOrg()]);
    const userA = await createScratchUser("Org A User", orgA);
    const { colonyId: colonyIdB } = await createScratchPlot(orgB);
    createdColonyIds.push(colonyIdB);

    await expect(
      updateColonyBackdropTransform(userA.client, colonyIdB, {
        x: 99,
        y: 99,
        scale: 1,
        rotateDeg: 0,
        darkenAlpha: 0,
        enabledOnAdmin: true,
        enabledOnPublic: true,
        attribution: "hijacked",
      }),
    ).rejects.toThrow(/not found, or you do not have access/);

    const admin = serviceRoleClient();
    const row = await fetchColonyById(admin, colonyIdB);
    expect(row?.backdrop_transform_x).toBe(0); // untouched — the column default

    await deleteScratchUser(userA);
  }, 15_000);

  it("updateColonyBackdropTransform: rejects a nonexistent colony id, not a silent no-op", async () => {
    const orgId = await createScratchOrg();
    const user = await createScratchUser("Backdrop Test User", orgId);

    await expect(
      updateColonyBackdropTransform(user.client, "no-such-colony-id", {
        x: 1,
        y: 1,
        scale: 1,
        rotateDeg: 0,
        darkenAlpha: 0,
        enabledOnAdmin: false,
        enabledOnPublic: false,
        attribution: "",
      }),
    ).rejects.toThrow(/not found, or you do not have access/);

    await deleteScratchUser(user);
  }, 15_000);
});
