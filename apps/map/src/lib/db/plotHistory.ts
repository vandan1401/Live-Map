import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotHistoryInsert, PlotHistoryRow } from "./types.ts";

export async function insertPlotHistory(
  client: SupabaseClient,
  rows: PlotHistoryInsert[],
): Promise<void> {
  const { error } = await client.from("plot_history").insert(rows);
  if (error) throw new Error(`insertPlotHistory failed: ${error.message}`);
}

// Newest first — the plot detail sheet (M3) renders this as a compact list, and the
// most recent change is what a family member checking the app actually wants to see.
export async function fetchPlotHistory(
  client: SupabaseClient,
  plotId: string,
): Promise<PlotHistoryRow[]> {
  const { data, error } = await client
    .from("plot_history")
    .select("*")
    .eq("plot_id", plotId)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(`fetchPlotHistory failed: ${error.message}`);
  return (data as PlotHistoryRow[] | null) ?? [];
}
