import type { SupabaseClient } from "@supabase/supabase-js";
import mapBackdropData from "../../config/mapBackdrop.json";
import type { MapBackdropTransform } from "./mapBackdropTransform.ts";

// docs/plans/29.md: the backdrop raster + its alignment metadata now live in Supabase
// Storage / the colonies table (colonyBackdrop.ts, uploaded via the admin portal — no
// redeploy required). Only place/road labels stay checked-in JSON (D-034's precedent,
// narrowed to just this remaining field) — out of scope per PROGRESS.md Backlog item 6,
// which only asked about "image + alignment". This is still the SINGLE place a colony id
// is matched to its backdrop (docs/plans/28.md §3 layer discipline) — resolving null is the
// normal case for every colony without one.

export interface MapBackdropLabel {
  text: string;
  kind: "place" | "road";
  worldX: number;
  worldY: number;
}

export interface MapBackdropData {
  transform: MapBackdropTransform;
  imageWidth: number;
  imageHeight: number;
  attribution: string;
  labels: MapBackdropLabel[];
  /** 0..1 solid-black alpha painted over the raster before plots draw on top (owner,
   * 2026-09-09) -- per colony, not a shared constant, since different source imagery needs
   * different darkening for its own plot colours to pop. See drawBackdrop.ts. */
  darkenAlpha: number;
  /** Independent on/off switches per surface (owner ask, 2026-09-09, alongside wiring the
   * backdrop into the admin map for the first time -- see Backlog #1 in PROGRESS.md): a
   * colony can have a backdrop asset ready without it being live on either surface yet, and
   * the admin map's own chrome (compass/search/toolbar/PlotDetailSheet) is dense enough that
   * the owner may want it off there even once it's live on the public link, or vice versa. */
  enabledOnAdmin: boolean;
  enabledOnPublic: boolean;
}

export interface MapBackdrop {
  url: string;
  data: MapBackdropData;
}

const LABELS = mapBackdropData as Record<string, { labels: MapBackdropLabel[] }>;

const BACKDROP_BUCKET = "colony-backdrops";

export type MapBackdropSurface = "admin" | "public";

// The colonies-row / get_public_colony() field shape both surfaces satisfy verbatim (the
// public RPC's jsonb_build_object keys are the same snake_case column names, minus
// backdrop_enabled_on_admin — see 20260912010000_public_link_backdrop.sql) — no field
// renaming needed at either call site.
export interface ColonyBackdropFields {
  id: string;
  backdrop_storage_path: string | null;
  backdrop_image_width: number | null;
  backdrop_image_height: number | null;
  backdrop_transform_x: number;
  backdrop_transform_y: number;
  backdrop_transform_scale: number;
  backdrop_transform_rotate_deg: number;
  backdrop_darken_alpha: number;
  backdrop_enabled_on_admin: boolean;
  backdrop_enabled_on_public: boolean;
  backdrop_attribution: string;
}

// Fully synchronous — no await, no Promise. getPublicUrl is a pure string build (no network
// call), so this stays safely callable inline inside the map's mount effect, before
// L.map() is constructed, exactly like the old Record-lookup resolveMapBackdrop did.
export function resolveMapBackdropFromRow(
  client: SupabaseClient,
  row: ColonyBackdropFields | null,
  surface: MapBackdropSurface,
): MapBackdrop | null {
  if (!row || !row.backdrop_storage_path || row.backdrop_image_width == null || row.backdrop_image_height == null) {
    return null;
  }
  const enabled = surface === "admin" ? row.backdrop_enabled_on_admin : row.backdrop_enabled_on_public;
  if (!enabled) return null;

  const { data } = client.storage.from(BACKDROP_BUCKET).getPublicUrl(row.backdrop_storage_path);
  const labels = LABELS[row.id]?.labels ?? [];

  return {
    url: data.publicUrl,
    data: {
      transform: {
        x: row.backdrop_transform_x,
        y: row.backdrop_transform_y,
        scale: row.backdrop_transform_scale,
        rotateDeg: row.backdrop_transform_rotate_deg,
      },
      imageWidth: row.backdrop_image_width,
      imageHeight: row.backdrop_image_height,
      attribution: row.backdrop_attribution,
      labels,
      darkenAlpha: row.backdrop_darken_alpha,
      enabledOnAdmin: row.backdrop_enabled_on_admin,
      enabledOnPublic: row.backdrop_enabled_on_public,
    },
  };
}
