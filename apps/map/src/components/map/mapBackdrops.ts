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
}

export interface MapBackdrop {
  url: string;
  data: MapBackdropData;
}

const DATA = mapBackdropData as Record<string, MapBackdropData>;

const BACKDROPS: Record<string, string> = {
  bharatkshetra: bharatkshetraBackdropUrl,
};

export function resolveMapBackdrop(colonyId: string | null): MapBackdrop | null {
  if (!colonyId) return null;
  const url = BACKDROPS[colonyId];
  const data = DATA[colonyId];
  if (!url || !data) return null;
  return { url, data };
}
