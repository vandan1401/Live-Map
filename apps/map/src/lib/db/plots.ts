import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotInsert, PlotRow, PlotStatus } from "./types.ts";

export async function insertPlots(
  client: SupabaseClient,
  plots: PlotInsert[],
): Promise<PlotRow[]> {
  const { data, error } = await client.from("plots").insert(plots).select();
  if (error) throw new Error(`insertPlots failed: ${error.message}`);
  return data as PlotRow[];
}

// lib/colony/ shapes this into whatever the render layer needs — this stays a plain
// svg_id -> status map, nothing DOM-aware.
export async function fetchPlotStatuses(
  client: SupabaseClient,
  colonyId: string,
): Promise<Record<string, PlotStatus>> {
  const { data, error } = await client
    .from("plots")
    .select("svg_id, status")
    .eq("colony_id", colonyId);
  if (error) throw new Error(`fetchPlotStatuses failed: ${error.message}`);

  const statuses: Record<string, PlotStatus> = {};
  for (const row of data ?? []) {
    statuses[row.svg_id as string] = row.status as PlotStatus;
  }
  return statuses;
}

// Full row for the plot detail sheet (M3) — every D-012 field, not just status.
export async function fetchPlotBySvgId(
  client: SupabaseClient,
  colonyId: string,
  svgId: string,
): Promise<PlotRow | null> {
  const { data, error } = await client
    .from("plots")
    .select("*")
    .eq("colony_id", colonyId)
    .eq("svg_id", svgId)
    .maybeSingle();
  if (error) throw new Error(`fetchPlotBySvgId failed: ${error.message}`);
  return (data as PlotRow | null) ?? null;
}
