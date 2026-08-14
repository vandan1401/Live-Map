import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchColonyById } from "../db/colonies.ts";
import { fetchPlotStatuses } from "../db/plots.ts";
import type { PlotStatus } from "../db/types.ts";

// Pure domain shaping — no DOM access. Components (e.g. ColonyMap.tsx) own applying the
// result as a `data-status` attribute; this layer only knows what the status is.
//
// Invariant 2 (D-108): an unverified colony must render as absent, not silently. Checked
// here rather than only at import time, because a second, unverified colony added later
// would otherwise render exactly like a verified one.
export async function loadPlotStatuses(
  client: SupabaseClient,
  colonyId: string,
): Promise<Record<string, PlotStatus>> {
  const colony = await fetchColonyById(client, colonyId);
  if (!colony?.verified) return {};
  return fetchPlotStatuses(client, colonyId);
}
