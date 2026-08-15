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

// Colony-wide "recent changes" for the share summary (M6, spec/06) — filtered by an
// already-fetched plot id list rather than a joined query, so this stays a plain `.in()`
// in the same style as the rest of lib/db/ instead of relying on supabase-js's
// relationship-embedding syntax. Excludes `changed_by: "import"`/`"bulk_import"` rows —
// both are one-off bookkeeping sentinels (scripts/import-seed.ts's initial load and
// bulk_set_initial_plot_data's CSV/XLSX import, docs/plans/10.md), not a change anyone
// made in the operational sense; surfacing them in the WhatsApp share text as "changes" a
// family member could act on is exactly the fabricated-evidence failure invariant 5
// exists to prevent (originally a /review finding for "import" alone).
export async function fetchRecentHistoryForPlots(
  client: SupabaseClient,
  plotIds: string[],
  limit: number,
): Promise<PlotHistoryRow[]> {
  if (plotIds.length === 0) return [];
  const { data, error } = await client
    .from("plot_history")
    .select("*")
    .in("plot_id", plotIds)
    .not("changed_by", "in", "(import,bulk_import)")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchRecentHistoryForPlots failed: ${error.message}`);
  return (data as PlotHistoryRow[] | null) ?? [];
}
