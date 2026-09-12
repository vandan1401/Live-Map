// docs/plans/29.md: colony backdrop image + alignment, uploadable via the admin portal —
// same split as publicColony.ts's regeneratePublicLink/revokePublicLink (a plain function
// taking a service-role SupabaseClient, doing client.from("colonies").update(...)), called
// only from admin-portal/server.ts today.
import type { SupabaseClient } from "@supabase/supabase-js";

const BACKDROP_BUCKET = "colony-backdrops";

// The JPEG magic number (FF D8 FF) — this project only ever ships JPEG backdrops (see
// bake_static.html/stitch.html's own output convention). Pure so it can be unit-tested
// without a real HTTP round-trip; admin-portal/server.ts calls this before ever decoding a
// request body into a real upload.
export function isJpegBuffer(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export interface UploadColonyBackdropImageArgs {
  bytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
}

// Object path is always "<colonyId>.jpg" — one object per colony, upsert:true so a
// re-upload replaces in place at the same path (getPublicUrl's result for a given colony
// never changes). Only ever touches the three image columns — a re-upload must never
// silently reset a previously-tuned alignment (transform/darkenAlpha/enabled flags), see
// docs/plans/29.md §3.
export async function uploadColonyBackdropImage(
  client: SupabaseClient,
  colonyId: string,
  args: UploadColonyBackdropImageArgs,
): Promise<void> {
  const storagePath = `${colonyId}.jpg`;
  const { error: uploadError } = await client.storage
    .from(BACKDROP_BUCKET)
    .upload(storagePath, args.bytes, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw new Error(`uploadColonyBackdropImage failed: ${uploadError.message}`);

  const { error: updateError } = await client
    .from("colonies")
    .update({
      backdrop_storage_path: storagePath,
      backdrop_image_width: args.imageWidth,
      backdrop_image_height: args.imageHeight,
    })
    .eq("id", colonyId);
  if (updateError) throw new Error(`uploadColonyBackdropImage failed to update colony row: ${updateError.message}`);
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
  const { error } = await client
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
    .eq("id", colonyId);
  if (error) throw new Error(`updateColonyBackdropTransform failed: ${error.message}`);
}
