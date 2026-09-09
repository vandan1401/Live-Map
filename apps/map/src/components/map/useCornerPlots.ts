import { useEffect, type RefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCornerPlotIds } from "../../lib/db/plots.ts";

// is_corner never changes after import (tier-2.md's "Derived fields" rule), so this is one
// plain fetch at mount, not a realtime subscription like the plot statuses.
//
// Split out of useColonyCanvas.ts for invariant 7's 250-line cap (usePlotDimensions.ts's
// own precedent) — writes into a ref and asks for a repaint rather than holding React
// state, same reasoning as that hook.
export function useCornerPlots(
  client: SupabaseClient,
  colonyId: string,
  target: RefObject<ReadonlySet<string>>,
  repaint: () => void,
): void {
  useEffect(() => {
    let cancelled = false;
    void fetchCornerPlotIds(client, colonyId)
      .then((ids) => {
        if (cancelled) return;
        target.current = ids;
        repaint();
      })
      .catch((error: unknown) => {
        console.error("failed to load corner plot ids:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [client, colonyId, target, repaint]);
}
