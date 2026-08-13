import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlotStatus } from "../db/types.ts";

export type SyncConnectionStatus = "connected" | "disconnected";

interface Handlers {
  onChange: (svgId: string, status: PlotStatus) => void;
  onStatusChange: (status: SyncConnectionStatus) => void;
}

// One channel per (client, colony) pair, UPDATE only — plots are only ever inserted by
// the one-off seed import, never during normal use, so INSERT/DELETE are out of scope.
// Returns an unsubscribe function; the caller's effect cleanup must call it, same
// discipline as the existing `cancelled` pattern in ColonyMap.tsx's mount effect.
export function subscribePlotChanges(
  client: SupabaseClient,
  colonyId: string,
  handlers: Handlers,
): () => void {
  const channel = client
    .channel(`plots-changes-${colonyId}`)
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
