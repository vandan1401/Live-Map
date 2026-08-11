import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlotStatuses } from "../db/plots.ts";
import type { PlotStatus } from "../db/types.ts";

// Pure domain shaping — no DOM access. Components (e.g. ColonyMap.tsx) own applying the
// result as a `data-status` attribute; this layer only knows what the status is.
export async function loadPlotStatuses(
  client: SupabaseClient,
  colonyId: string,
): Promise<Record<string, PlotStatus>> {
  return fetchPlotStatuses(client, colonyId);
}
