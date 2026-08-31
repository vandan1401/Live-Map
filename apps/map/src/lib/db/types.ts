// Mirrors apps/map/supabase/migrations/20260812120000_m2_schema.sql. Keep field names
// snake_case — these map directly to Postgres columns via supabase-js.

export type PlotStatus = "available" | "booked" | "registered";

export type Facing =
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west";

export interface ColonyInsert {
  id: string;
  // docs/plans/21.md phase 1: which organization owns this row. Service-role-path-only —
  // the real app never constructs one of these directly (the only client-visible write
  // path, create_colony_from_manifest, derives it server-side from the caller's session
  // and takes no org_id parameter at all, same D-020 shape as attribution). Only
  // scripts/import-seed.ts and test setup (rls.test.ts's createScratchPlot) supply this.
  org_id: string;
  name: string;
  verified: boolean;
  source_file?: string | null;
  generated?: string | null;
  // Runtime SVG markup (D-025, docs/plans/11.md) — every writer supplies it; nullable only
  // at the column level (a schema migration can't backfill a file that lives on disk).
  svg: string;
  // The owner-drawn COL-ZOOM-REF rectangle's extent, in SVG viewBox px (docs/plans/20.md).
  // Legitimately null forever for a colony whose DXF has no such rectangle — not a
  // migration-can't-backfill artifact like svg's nullability above.
  select_zoom_ref_width_px?: number | null;
  select_zoom_ref_height_px?: number | null;
}

export interface ColonyRow extends Omit<ColonyInsert, "svg"> {
  created_at: string;
  // string | null, not ColonyInsert's required string — the column itself is nullable
  // (docs/plans/11.md §2.1: no backfill migration), so a read must stay honest about that
  // even though every current writer supplies it. ColonyMap.tsx guards the null case.
  svg: string | null;
}

export interface PlotInsert {
  colony_id: string;
  // docs/plans/21.md phase 1: same posture as ColonyInsert.org_id above — service-role-
  // path-only, never a client-supplied parameter on the real write path.
  org_id: string;
  svg_id: string;
  block: string;
  number: string;
  area_sqft: number;
  length_ft: number;
  breadth_ft: number;
  facing: Facing;
  is_corner: boolean;
  status: PlotStatus;
  owner_name?: string | null;
  owner_phone?: string | null;
  broker_name?: string | null;
  rate_paise?: number | null;
  booking_amount_paise?: number | null;
  booking_date?: string | null;
  registry_date?: string | null;
  notes?: string | null;
  updated_by: string;
}

export interface PlotRow extends PlotInsert {
  id: string;
  version: number;
  updated_at: string;
  created_at: string;
}

export interface PlotHistoryInsert {
  plot_id: string;
  // docs/plans/21.md phase 1: same posture as ColonyInsert.org_id/PlotInsert.org_id —
  // service-role-path-only. The real write path (apply_plot_transition,
  // bulk_set_initial_plot_data) derives and inserts this itself, inside the RPC.
  org_id: string;
  status: PlotStatus;
  changed_by: string;
  note?: string | null;
}

export interface PlotHistoryRow extends PlotHistoryInsert {
  id: string;
  changed_at: string;
}

// bulk_set_initial_plot_data's row shape (docs/plans/10.md) — one CSV/XLSX row. Mirrors
// PlotInsert's optional fields, minus geometry (svg_id is the join key against an
// existing plots row, never used to create one).
export interface BulkImportRow {
  svg_id: string;
  status: PlotStatus;
  owner_name: string | null;
  owner_phone: string | null;
  broker_name: string | null;
  rate_paise: number | null;
  booking_amount_paise: number | null;
  booking_date: string | null;
  registry_date: string | null;
  notes: string | null;
}

export interface BulkImportSkip {
  svgId: string;
  reason: string;
}

export interface BulkImportResult {
  applied: string[];
  skipped: BulkImportSkip[];
}

// The subset of contract/colony.schema.json's manifest shape apps/map actually reads
// (docs/plans/11.md §1 — confirmed by grep that nothing else, e.g. viewbox/scale/
// north_deg/features/centroid/confidence, is used anywhere in this app). Schema
// conformance itself is checked by Ajv against the real schema file
// (lib/colony/parseColonyManifest.ts), not by this type — this only shapes what the rest
// of the upload path is allowed to read off an already-validated manifest.
export interface ColonyManifestPlot {
  svg_id: string;
  block: string;
  number: string;
  area_sqft: number;
  length_ft: number;
  breadth_ft: number;
  facing: Facing;
  is_corner: boolean;
}

export interface ColonyManifest {
  colony: {
    id: string;
    name: string;
    verified: boolean;
    generated: string;
    source: { file: string };
    // Optional (docs/plans/20.md) — present only when the source DXF had a COL-ZOOM-REF
    // rectangle. Unlike viewbox/scale/north_deg/etc. (deliberately never read by this app,
    // see the comment above ColonyManifestPlot), this one the app does consume.
    select_zoom?: { ref_width_px: number; ref_height_px: number };
  };
  plots: ColonyManifestPlot[];
}

export type CreateColonyResult =
  | { ok: true; colonyId: string }
  | { ok: false; reason: "colony_exists" }
  | { ok: false; reason: "would_orphan_history"; missingSvgIds: string[] }
  // docs/plans/21.md phase 1: a replace whose existing colony belongs to a different
  // organization than the caller's own. Not reachable in normal single-org use.
  | { ok: false; reason: "org_mismatch" };
