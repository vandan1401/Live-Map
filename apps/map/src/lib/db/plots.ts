import type { SupabaseClient } from "@supabase/supabase-js";
import type { BulkImportResult, BulkImportRow, PlotInsert, PlotRow, PlotStatus } from "./types.ts";

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

// Full rows for a colony (M6) — search (owner/broker/number) and the share summary
// (status counts, recent-changes labels) both need more than just status, and the
// colony is only a few hundred rows, so one in-memory fetch beats a bespoke query per
// feature.
export async function fetchPlotsByColony(
  client: SupabaseClient,
  colonyId: string,
): Promise<PlotRow[]> {
  // Ordered (docs/plans/10.md /review finding) — svg_id is "plot-{BLOCK}-{NN}" with the
  // number zero-padded to two digits, so lexical order is manifest order. Without this,
  // Postgres gives no ordering guarantee and a heap UPDATE (every status save, every
  // bulk_set_initial_plot_data run) can reshuffle the row on the next fetch — the table
  // view has no other way to find a plot in a several-hundred-row list.
  const { data, error } = await client
    .from("plots")
    .select("*")
    .eq("colony_id", colonyId)
    .order("svg_id");
  if (error) throw new Error(`fetchPlotsByColony failed: ${error.message}`);
  return (data as PlotRow[] | null) ?? [];
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

// The only place bulk_set_initial_plot_data() is called (docs/plans/10.md,
// NAVIGATION.md's "supabase.from/.rpc only in lib/db/" rule). Domain-shaped typing
// (snake_case svgId -> svgId) happens one layer up in
// lib/colony/bulkImportInitialPlotData.ts, same split as plotTransitions.ts / applyPlotTransition.ts.
export async function callBulkSetInitialPlotData(
  client: SupabaseClient,
  colonyId: string,
  rows: BulkImportRow[],
): Promise<BulkImportResult> {
  const { data, error } = await client.rpc("bulk_set_initial_plot_data", {
    p_colony_id: colonyId,
    p_rows: rows,
  });
  if (error) throw new Error(`callBulkSetInitialPlotData failed: ${error.message}`);
  const result = data as { applied: string[]; skipped: { svg_id: string; reason: string }[] };
  return {
    applied: result.applied,
    skipped: result.skipped.map((s) => ({ svgId: s.svg_id, reason: s.reason })),
  };
}
