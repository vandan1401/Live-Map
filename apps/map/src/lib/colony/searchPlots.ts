import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlotsByColony } from "../db/plots.ts";
import type { PlotRow } from "../db/types.ts";

// Pure domain shaping — no DOM access, so this half of M6 (spec/06) is unit-testable
// without a browser or a database. `loadSearchIndex` below is the only impure part.
export interface SearchEntry {
  svgId: string;
  label: string;
  ownerName: string | null;
  brokerName: string | null;
}

export function buildSearchIndex(plots: PlotRow[]): SearchEntry[] {
  return plots.map((plot) => ({
    svgId: plot.svg_id,
    label: `${plot.block}-${plot.number}`,
    // owner_name is sticky at the DB layer (docs/plans/08.md §3 — it's never cleared on
    // an un-book, so Undo can restore it) — search must not surface a buyer name for a
    // plot that isn't currently booked, or an un-booked plot stays findable by, and
    // reads as sold to, whoever booked it last.
    ownerName: plot.status === "booked" ? (plot.owner_name ?? null) : null,
    brokerName: plot.broker_name ?? null,
  }));
}

// Case-insensitive substring match against plot number, owner, and broker (spec/06
// criterion 2). An empty/whitespace query returns no results rather than the whole
// colony — the caller renders "no results" only once the user has actually typed
// something, not on every keystroke of an empty box.
export function searchPlots(index: SearchEntry[], query: string): SearchEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return index.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      entry.ownerName?.toLowerCase().includes(needle) ||
      entry.brokerName?.toLowerCase().includes(needle),
  );
}

// The whole colony is a few hundred rows (spec/06) — one fetch, held in memory, no
// server round trip per keystroke.
export async function loadSearchIndex(
  client: SupabaseClient,
  colonyId: string,
): Promise<SearchEntry[]> {
  const plots = await fetchPlotsByColony(client, colonyId);
  return buildSearchIndex(plots);
}
