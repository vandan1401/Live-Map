import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotRow, PlotStatus } from "./types.ts";

export interface ApplyPlotTransitionArgs {
  plotId: string;
  expectedVersion: number;
  newStatus: PlotStatus;
  actor: string;
  note?: string | null;
}

// The only place apply_plot_transition() is called. Throws on any RPC error, including
// the "version_conflict:<name>" one — parsing that into a typed outcome is
// lib/plot-status/applyPlotTransition.ts's job, not this layer's (NAVIGATION.md layer
// rule: supabase.from/.rpc only appears in lib/db/).
export async function callApplyPlotTransition(
  client: SupabaseClient,
  args: ApplyPlotTransitionArgs,
): Promise<PlotRow> {
  const { data, error } = await client.rpc("apply_plot_transition", {
    p_plot_id: args.plotId,
    p_expected_version: args.expectedVersion,
    p_new_status: args.newStatus,
    p_actor: args.actor,
    p_note: args.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as PlotRow;
}
