import type { SupabaseClient } from "@supabase/supabase-js";
import type { BulkImportResult, BulkImportRow, PlotInsert, PlotRow, PlotStatus } from "./types.ts";

// PostgREST caps any one response at max_rows (1000 — supabase/config.toml, and the hosted
// default), silently, with no error. A colony past that lost every row beyond the cap: the
// plots had no entry in the status map, so the painter drew them in bare plot-base colour
// beside correctly tinted neighbours (colony 1599, 2026-10-27). Every fetcher that reads a
// whole colony pages through this instead of trusting one request.
// PAGE_SIZE equals that cap: a larger request is truncated to it anyway, a smaller one just
// costs more round trips. The loop stops on an EMPTY page, not a short one, so it stays
// correct if a project ever lowers max_rows below PAGE_SIZE.
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(`${what} failed: ${error.message}`);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}

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
  // Ordered: range() paging over an unordered query can skip or repeat rows between pages.
  const data = await fetchAllPages<{ svg_id: string; status: string }>("fetchPlotStatuses", (from, to) =>
    client.from("plots").select("svg_id, status").eq("colony_id", colonyId).order("svg_id").range(from, to),
  );

  const statuses: Record<string, PlotStatus> = {};
  for (const row of data) {
    statuses[row.svg_id as string] = row.status as PlotStatus;
  }
  return statuses;
}

// svg_ids of every corner plot in a colony (owner ask, 2026-08-22: the map's new rounded
// plot corners should not round an actual corner plot's own geometry). is_corner is
// computed once at import and never recomputed (tier-2.md's "Derived fields" rule), so —
// like fetchPlotStatuses's shape but unlike its data — this never needs a realtime
// subscription: it cannot go stale after the one fetch at mount.
export async function fetchCornerPlotIds(
  client: SupabaseClient,
  colonyId: string,
): Promise<Set<string>> {
  const data = await fetchAllPages<{ svg_id: string }>("fetchCornerPlotIds", (from, to) =>
    client.from("plots").select("svg_id").eq("colony_id", colonyId).eq("is_corner", true).order("svg_id").range(from, to),
  );
  return new Set(data.map((row) => row.svg_id));
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
  // A blockless plot's svg_id is "plot-{NN}" (docs/plans/15.md) — lexically before every
  // "plot-A-…" id (ASCII "0" < "A"), so blockless plots sort as a group ahead of every
  // lettered block rather than interleaved by number. Accepted, not fixed (plan 15 §3).
  return fetchAllPages<PlotRow>("fetchPlotsByColony", (from, to) =>
    client.from("plots").select("*").eq("colony_id", colonyId).order("svg_id").range(from, to),
  );
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
