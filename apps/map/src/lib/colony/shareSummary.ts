import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchColonyById } from "../db/colonies.ts";
import { fetchPlotsByColony } from "../db/plots.ts";
import { fetchRecentHistoryForPlots } from "../db/plotHistory.ts";
import { formatPlotLabel, formatRelativeTime, formatStatusLabel } from "../../shared/format.ts";
import type { PlotStatus } from "../db/types.ts";
import { DEFAULT_STATUS_KEYS } from "./colonyStatuses.ts";

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
  // docs/plans/40.md: counts by status key, and the keys in the colony's legend order (so the text
  // lists a colony's own statuses, in its own order, including ones with zero plots).
  counts: Record<PlotStatus, number>;
  statusKeys: PlotStatus[];
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

  const statusKeys: PlotStatus[] = colony?.statuses?.map((s) => s.key) ?? [...DEFAULT_STATUS_KEYS];
  const counts: Record<PlotStatus, number> = Object.fromEntries(statusKeys.map((key) => [key, 0]));
  const labelByPlotId = new Map<string, string>();
  for (const plot of plots) {
    // A key outside the list should be impossible (the database refuses it), but a silently
    // uncounted plot would make the totals lie — count it and list it rather than drop it.
    if (!(plot.status in counts)) statusKeys.push(plot.status);
    counts[plot.status] = (counts[plot.status] ?? 0) + 1;
    labelByPlotId.set(plot.id, formatPlotLabel(plot));
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

  return { colonyName: colony?.name ?? colonyId, counts, statusKeys, recentChanges };
}

// The literal text block the family pastes into WhatsApp (spec/06) — plain sentence
// case, no product-marketing tone (tier-3.md's Copy rule applies here too even though
// this function lives in lib/, since its whole output is user-facing copy).
export function formatShareSummary(
  data: ShareSummaryData,
  now: Date = new Date(),
  // Resolved by ShareSummary.tsx from presentation.json (docs/plans/27.md) — omitted
  // falls back to formatStatusLabel's own default text.
  statusLabels?: Partial<Record<PlotStatus, string>>,
): string {
  const lines = [
    `${data.colonyName} — plot status`,
    "",
    ...data.statusKeys.map((key) => `${formatStatusLabel(key, statusLabels)}: ${data.counts[key] ?? 0}`),
  ];

  if (data.recentChanges.length > 0) {
    lines.push("", "Recent changes:");
    for (const change of data.recentChanges) {
      lines.push(
        `${change.label} — ${formatStatusLabel(change.status, statusLabels)} by ${change.changedBy}, ${formatRelativeTime(change.changedAt, now)}`,
      );
    }
  }

  return lines.join("\n");
}
