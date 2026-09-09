import bharatkshetraBackdropUrl from "../../assets/backdrops/bharatkshetra.jpg";
import mapBackdropData from "../../config/mapBackdrop.json";
import type { MapBackdropTransform } from "./mapBackdropTransform.ts";

// docs/plans/28.md, D-036: per-colony synthetic-aerial backdrop config, checked-in JSON
// (D-034's precedent) plus a statically-imported image per colony -- JSON can't hold a Vite
// asset reference, so the two are joined here, one entry per colony that has a backdrop.
// This is the SINGLE place a colony id is matched to a backdrop asset (docs/plans/28.md §3
// layer discipline) -- resolving null is the normal case for every colony without one.

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

const DATA = mapBackdropData as Record<string, MapBackdropData>;

const BACKDROPS: Record<string, string> = {
  bharatkshetra: bharatkshetraBackdropUrl,
};

export type MapBackdropSurface = "admin" | "public";

export function resolveMapBackdrop(colonyId: string | null, surface: MapBackdropSurface): MapBackdrop | null {
  if (!colonyId) return null;
  const url = BACKDROPS[colonyId];
  const data = DATA[colonyId];
  if (!url || !data) return null;
  const enabled = surface === "admin" ? data.enabledOnAdmin : data.enabledOnPublic;
  if (!enabled) return null;
  return { url, data };
}
