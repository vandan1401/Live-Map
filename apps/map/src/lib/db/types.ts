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
  name: string;
  verified: boolean;
  source_file?: string | null;
  generated?: string | null;
}

export interface ColonyRow extends ColonyInsert {
  created_at: string;
}

export interface PlotInsert {
  colony_id: string;
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
  status: PlotStatus;
  changed_by: string;
  note?: string | null;
}

export interface PlotHistoryRow extends PlotHistoryInsert {
  id: string;
  changed_at: string;
}
