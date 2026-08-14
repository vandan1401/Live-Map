import type { SupabaseClient } from "@supabase/supabase-js";
import { callApplyPlotTransition } from "../db/plotTransitions.ts";
import type { PlotRow, PlotStatus } from "../db/types.ts";
import { isLegalTransition } from "./transitions.ts";

export type PlotTransitionResult =
  | { ok: true; plot: PlotRow }
  | { ok: false; reason: "illegal_transition" }
  | { ok: false; reason: "conflict"; winnerName: string };

export interface ApplyPlotTransitionInput {
  plotId: string;
  fromStatus: PlotStatus;
  toStatus: PlotStatus;
  expectedVersion: number;
  actor: string;
  note?: string | null;
  // Fresh booking only (docs/plans/08.md) — omitted on every other transition, including
  // Undo, so the RPC's coalesce leaves the existing owner_name in place.
  ownerName?: string | null;
}

const CONFLICT_PREFIX = "version_conflict:";

// The only write path for plots.status (D-006, D-013, spec/04). Nothing else may call
// callApplyPlotTransition or the RPC directly. illegal_transition and conflict are typed
// outcomes, never thrown — anything else (network failure, plot not found, an unknown
// Postgres error) throws, because those aren't business outcomes a caller routes UI copy
// on.
export async function applyPlotTransition(
  client: SupabaseClient,
  input: ApplyPlotTransitionInput,
): Promise<PlotTransitionResult> {
  if (!isLegalTransition(input.fromStatus, input.toStatus)) {
    return { ok: false, reason: "illegal_transition" };
  }

  try {
    const plot = await callApplyPlotTransition(client, {
      plotId: input.plotId,
      expectedVersion: input.expectedVersion,
      newStatus: input.toStatus,
      actor: input.actor,
      note: input.note,
      ownerName: input.ownerName,
    });
    return { ok: true, plot };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(CONFLICT_PREFIX)) {
      return { ok: false, reason: "conflict", winnerName: message.slice(CONFLICT_PREFIX.length) };
    }
    throw error;
  }
}
