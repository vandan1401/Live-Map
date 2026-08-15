import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotRow, PlotStatus } from "./types.ts";

export interface ApplyPlotTransitionArgs {
  plotId: string;
  expectedVersion: number;
  newStatus: PlotStatus;
  note?: string | null;
  // Set only on a fresh available -> booked transition (docs/plans/08.md). Omitted on
  // every other call so the RPC's coalesce leaves the existing owner_name untouched.
  ownerName?: string | null;
}

// The only place apply_plot_transition() is called. Throws on any RPC error, including
// the "version_conflict:<name>" one — parsing that into a typed outcome is
// lib/plot-status/applyPlotTransition.ts's job, not this layer's (NAVIGATION.md layer
// rule: supabase.from/.rpc only appears in lib/db/). No actor field — attribution is
// derived server-side from the caller's session (D-020, docs/plans/09.md); there is
// nothing here for a forged client payload to override.
export async function callApplyPlotTransition(
  client: SupabaseClient,
  args: ApplyPlotTransitionArgs,
): Promise<PlotRow> {
  const { data, error } = await client.rpc("apply_plot_transition", {
    p_plot_id: args.plotId,
    p_expected_version: args.expectedVersion,
    p_new_status: args.newStatus,
    p_note: args.note ?? null,
    p_owner_name: args.ownerName ?? null,
  });
  if (error) throw new Error(error.message);
  return data as PlotRow;
}
