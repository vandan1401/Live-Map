import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotStatus } from "../db/types.ts";

export type SyncConnectionStatus = "connected" | "disconnected";

interface Handlers {
  onChange: (svgId: string, status: PlotStatus) => void;
  onStatusChange: (status: SyncConnectionStatus) => void;
}

// One channel per *call*, UPDATE only — plots are only ever inserted by the one-off seed
// import, never during normal use, so INSERT/DELETE are out of scope. Returns an
// unsubscribe function; the caller's effect cleanup must call it, same discipline as the
// existing `cancelled` pattern in ColonyMap.tsx's mount effect.
//
// The topic carries a random suffix, not just colonyId (docs/plans/10.md — found live in
// the browser, not by any mocked-client test): client.channel(topic) on supabase-js
// returns the *same* channel object for a repeated topic, and calling .on() on a channel
// that's already past .subscribe() throws. ColonyMap's attachSync and PlotTableView can
// both be subscribed to the same colony at once (the table view overlays the map rather
// than unmounting it) — without a unique topic per call, the second subscribePlotChanges
// call collides with the first and crashes the whole tree with no error boundary.
export function subscribePlotChanges(
  client: SupabaseClient,
  colonyId: string,
  handlers: Handlers,
): () => void {
  const topicSuffix = Math.random().toString(36).slice(2, 8);
  const channel = client
    .channel(`plots-changes-${colonyId}-${topicSuffix}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "plots", filter: `colony_id=eq.${colonyId}` },
      (payload) => {
        const row = payload.new as { svg_id: string; status: PlotStatus };
        handlers.onChange(row.svg_id, row.status);
      },
    )
    .subscribe((status) => {
      handlers.onStatusChange(status === "SUBSCRIBED" ? "connected" : "disconnected");
    });

  return () => {
    void client.removeChannel(channel);
  };
}
