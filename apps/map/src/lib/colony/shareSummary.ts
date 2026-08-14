import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchColonyById } from "../db/colonies.ts";
import { fetchPlotsByColony } from "../db/plots.ts";
import { fetchRecentHistoryForPlots } from "../db/plotHistory.ts";
import { formatRelativeTime, formatStatusLabel } from "../../shared/format.ts";
import type { PlotStatus } from "../db/types.ts";

// Enough to be useful in a WhatsApp message without turning it into a wall of text
// (spec/06: "counts by status, plus recent changes" — no count pinned by the spec).
const RECENT_CHANGES_LIMIT = 5;

export interface RecentChange {
  label: string;
  status: PlotStatus;
  changedBy: string;
  changedAt: string;
}

export interface ShareSummaryData {
  colonyName: string;
  counts: Record<PlotStatus, number>;
  recentChanges: RecentChange[];
}

// Pure domain shaping, DOM-free — `loadShareSummaryData` below is the only impure part.
// Not unit-testing the DB round trip itself, same split as the rest of lib/colony/.
export async function loadShareSummaryData(
  client: SupabaseClient,
  colonyId: string,
): Promise<ShareSummaryData> {
  const [colony, plots] = await Promise.all([
    fetchColonyById(client, colonyId),
    fetchPlotsByColony(client, colonyId),
  ]);

  const counts: Record<PlotStatus, number> = { available: 0, booked: 0, registered: 0 };
  const labelByPlotId = new Map<string, string>();
  for (const plot of plots) {
    counts[plot.status] += 1;
    labelByPlotId.set(plot.id, `${plot.block}-${plot.number}`);
  }

  const history = await fetchRecentHistoryForPlots(
    client,
    plots.map((plot) => plot.id),
    RECENT_CHANGES_LIMIT,
  );
  const recentChanges = history.map((row) => ({
    label: labelByPlotId.get(row.plot_id) ?? row.plot_id,
    status: row.status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));

  return { colonyName: colony?.name ?? colonyId, counts, recentChanges };
}

// The literal text block the family pastes into WhatsApp (spec/06) — plain sentence
// case, no product-marketing tone (tier-3.md's Copy rule applies here too even though
// this function lives in lib/, since its whole output is user-facing copy).
export function formatShareSummary(data: ShareSummaryData, now: Date = new Date()): string {
  const lines = [
    `${data.colonyName} — plot status`,
    "",
    `Available: ${data.counts.available}`,
    `Booked: ${data.counts.booked}`,
    `Registry done: ${data.counts.registered}`,
  ];

  if (data.recentChanges.length > 0) {
    lines.push("", "Recent changes:");
    for (const change of data.recentChanges) {
      lines.push(
        `${change.label} — ${formatStatusLabel(change.status)} by ${change.changedBy}, ${formatRelativeTime(change.changedAt, now)}`,
      );
    }
  }

  return lines.join("\n");
}
