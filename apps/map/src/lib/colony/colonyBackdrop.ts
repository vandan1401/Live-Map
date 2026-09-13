// docs/plans/29.md + docs/plans/30.md: colony backdrop image + alignment. Same split as
// publicColony.ts's regeneratePublicLink/revokePublicLink (a plain function taking a
// SupabaseClient, doing client.from("colonies").update(...)) — client-agnostic on purpose,
// called both with the admin portal's service-role key (admin-portal/backdropRoutes.ts) and,
// since docs/plans/30.md's RLS/grant additions, with an ordinary signed-in org member's
// authenticated client (ColonyUploadScreen.tsx, docs/plans/33.md).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColonyManifestBackdrop } from "../db/types.ts";

const BACKDROP_BUCKET = "colony-backdrops";

export interface ImageFormat {
  ext: string;
  contentType: string;
}

// docs/plans/34.md: owner ask — any image format, not JPEG-only (the original
// bake_static.html/stitch.html pipeline only ever produced JPEGs, but a backdrop hand-
// supplied through the upload screen has no such guarantee). Magic-number detection only
// (same convention as the old isJpegBuffer) — never file extension or the browser's
// File.type, both trivially wrong/spoofable. Returns null for anything unrecognized so
// callers reject rather than guess.
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: "png", contentType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { ext: "gif", contentType: "image/gif" };
  }
  return null;
}

export interface UploadColonyBackdropImageArgs {
  bytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  format: ImageFormat;
}

// Object path is "<colonyId>.<ext>" — one object per colony, upsert:true so a re-upload
// in the *same* format replaces in place (getPublicUrl's result for a given colony never
// changes in that case). A re-upload in a *different* format changes the path, so the
// colony's previous row is read first and its old object removed after the new one lands
// — otherwise a jpg-then-png re-upload would leave the old jpg orphaned in Storage
// forever (spec/00-rules.md's orphans check). Only ever touches the three image columns
// — a re-upload must never silently reset a previously-tuned alignment (transform/
// darkenAlpha/enabled flags), see docs/plans/29.md §3.
export async function uploadColonyBackdropImage(
  client: SupabaseClient,
  colonyId: string,
  args: UploadColonyBackdropImageArgs,
): Promise<void> {
  const { data: existing } = await client
    .from("colonies")
    .select("backdrop_storage_path")
    .eq("id", colonyId)
    .maybeSingle();
  const storagePath = `${colonyId}.${args.format.ext}`;

  const { error: uploadError } = await client.storage
    .from(BACKDROP_BUCKET)
    .upload(storagePath, args.bytes, { contentType: args.format.contentType, upsert: true });
  if (uploadError) throw new Error(`uploadColonyBackdropImage failed: ${uploadError.message}`);

  // docs/plans/30.md: .select("id").maybeSingle() and a null-data check, not just
  // `if (error)` — under RLS (an authenticated, non-service-role caller) a wrong org or a
  // nonexistent colony id makes this .update() match zero rows *without* an error, which
  // would otherwise read as a silent success. Service-role calls (admin-portal) always
  // matched before and still do; this only changes behavior for a call that was already
  // wrong.
  const { data: updated, error: updateError } = await client
    .from("colonies")
    .update({
      backdrop_storage_path: storagePath,
      backdrop_image_width: args.imageWidth,
      backdrop_image_height: args.imageHeight,
    })
    .eq("id", colonyId)
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(`uploadColonyBackdropImage failed to update colony row: ${updateError.message}`);
  if (!updated) throw new Error(`uploadColonyBackdropImage: colony "${colonyId}" not found, or you do not have access to it.`);

  const oldPath = existing?.backdrop_storage_path as string | null | undefined;
  if (oldPath && oldPath !== storagePath) {
    await client.storage.from(BACKDROP_BUCKET).remove([oldPath]);
  }
}

export interface ColonyBackdropTransformArgs {
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
  darkenAlpha: number;
  enabledOnAdmin: boolean;
  enabledOnPublic: boolean;
  // The ODbL/OpenStreetMap credit rendered under the map (mapBackdrops.ts ->
  // ColonyMap.tsx/PublicColonyView.tsx) — a real attribution obligation, not decorative
  // (see public-colony.css), so it needs the same write path as the rest of the alignment
  // rather than staying a value only ever set by hand in the old checked-in JSON (a real
  // /review finding, 2026-09-12: without this the credit was deleted, not moved).
  attribution: string;
}

// All 8 fields are always sent together (the admin-portal form always submits the whole
// set) — no partial-update case to handle here.
export async function updateColonyBackdropTransform(
  client: SupabaseClient,
  colonyId: string,
  args: ColonyBackdropTransformArgs,
): Promise<void> {
  // docs/plans/30.md: same row-matched check as uploadColonyBackdropImage above — see its
  // comment for why this is load-bearing now, not just under RLS.
  const { data: updated, error } = await client
    .from("colonies")
    .update({
      backdrop_transform_x: args.x,
      backdrop_transform_y: args.y,
      backdrop_transform_scale: args.scale,
      backdrop_transform_rotate_deg: args.rotateDeg,
      backdrop_darken_alpha: args.darkenAlpha,
      backdrop_enabled_on_admin: args.enabledOnAdmin,
      backdrop_enabled_on_public: args.enabledOnPublic,
      backdrop_attribution: args.attribution,
    })
    .eq("id", colonyId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`updateColonyBackdropTransform failed: ${error.message}`);
  if (!updated) throw new Error(`updateColonyBackdropTransform: colony "${colonyId}" not found, or you do not have access to it.`);
}

export type ApplyManifestBackdropResult =
  | { applied: false }
  | { applied: true; ok: true }
  | { applied: true; ok: false; message: string };

// docs/plans/32.md, D-049: colony.json's own `backdrop` block is authoritative when
// present — the only way to set alignment (docs/plans/33.md removed the in-app manual
// editing form). Returns a result rather than throwing so a bad manifest-driven write
// never blocks the upload it belongs to.
export async function applyManifestBackdrop(
  client: SupabaseClient,
  colonyId: string,
  backdrop: ColonyManifestBackdrop | undefined,
): Promise<ApplyManifestBackdropResult> {
  if (!backdrop) return { applied: false };
  try {
    await updateColonyBackdropTransform(client, colonyId, {
      x: backdrop.transform.x,
      y: backdrop.transform.y,
      scale: backdrop.transform.scale,
      rotateDeg: backdrop.transform.rotate_deg,
      darkenAlpha: backdrop.darken_alpha,
      enabledOnAdmin: backdrop.enabled_on_admin,
      enabledOnPublic: backdrop.enabled_on_public,
      attribution: backdrop.attribution,
    });
    return { applied: true, ok: true };
  } catch (error) {
    return {
      applied: true,
      ok: false,
      message: error instanceof Error ? error.message : "Could not apply colony.json's backdrop alignment.",
    };
  }
}

export type BackdropImageResult = { ok: true } | { ok: false; message: string } | null;

// docs/plans/33.md: composes the one summary sentence ColonyUploadScreen.tsx shows on its
// terminal "done" stage — pulled out to a pure function (not inlined) so that file stays
// under the 250-line cap once it also has to account for the inline image upload's own
// outcome alongside the manifest-driven alignment's.
export function composeBackdropIntro(args: {
  colonyId: string;
  backdropResult: ApplyManifestBackdropResult;
  imageResult: BackdropImageResult;
}): string {
  const { colonyId, backdropResult, imageResult } = args;
  const base = `Colony "${colonyId}" is live.`;

  const alignmentPart = !backdropResult.applied
    ? ""
    : backdropResult.ok
      ? " Its backdrop alignment from colony.json has been applied."
      : ` Could not apply colony.json's backdrop alignment (${backdropResult.message}).`;

  const imagePart =
    imageResult === null
      ? ""
      : imageResult.ok
        ? " The backdrop image was uploaded."
        : ` Could not upload the backdrop image (${imageResult.message}).`;

  return `${base}${alignmentPart}${imagePart}`;
}
