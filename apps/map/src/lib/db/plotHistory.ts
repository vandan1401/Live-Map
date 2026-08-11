import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotHistoryInsert } from "./types.ts";

export async function insertPlotHistory(
  client: SupabaseClient,
  rows: PlotHistoryInsert[],
): Promise<void> {
  const { error } = await client.from("plot_history").insert(rows);
  if (error) throw new Error(`insertPlotHistory failed: ${error.message}`);
}
