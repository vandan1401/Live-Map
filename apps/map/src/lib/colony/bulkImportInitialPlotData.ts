import type { SupabaseClient } from "@supabase/supabase-js";
import { callBulkSetInitialPlotData } from "../db/plots.ts";
import type { BulkImportResult, BulkImportRow } from "../db/types.ts";

// Domain-shaped wrapper (NAVIGATION.md's Domain layer) around the one-time initial-import
// RPC (docs/plans/10.md) — mirrors applyPlotTransition.ts's split from
// lib/db/plotTransitions.ts. DOM-free by design; features/bulk-import/BulkImportScreen.tsx
// is the only caller.
export async function bulkImportInitialPlotData(
  client: SupabaseClient,
  colonyId: string,
  rows: BulkImportRow[],
): Promise<BulkImportResult> {
  return callBulkSetInitialPlotData(client, colonyId, rows);
}
