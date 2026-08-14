import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchColonyById } from "../db/colonies.ts";
import { fetchPlotBySvgId } from "../db/plots.ts";
import { fetchPlotHistory } from "../db/plotHistory.ts";
import type { PlotHistoryRow, PlotRow } from "../db/types.ts";

export interface PlotDetail {
  plot: PlotRow;
  history: PlotHistoryRow[];
}

// Pure domain shaping — no DOM access (NAVIGATION.md layer rule). The plot detail
// sheet (M3) owns rendering; this only knows what the plot and its history are.
//
// Invariant 2 (D-108): an unverified colony's plots must not be readable here either —
// see the matching check in plotStatus.ts.
export async function loadPlotDetail(
  client: SupabaseClient,
  colonyId: string,
  svgId: string,
): Promise<PlotDetail | null> {
  const colony = await fetchColonyById(client, colonyId);
  if (!colony?.verified) return null;
  const plot = await fetchPlotBySvgId(client, colonyId, svgId);
  if (!plot) return null;
  const history = await fetchPlotHistory(client, plot.id);
  return { plot, history };
}
