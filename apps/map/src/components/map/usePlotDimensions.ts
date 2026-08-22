import { useEffect, type RefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlotBySvgId } from "../../lib/db/plots.ts";

export interface PlotDimensions {
  plotId: string;
  lengthFt: number;
  breadthFt: number;
}

// The two numbers the dimension callout needs. A small separate fetch from
// PlotDetailSheet's own load, exactly as before the canvas rewrite: the sheet owns its
// data lifecycle and this only wants length_ft/breadth_ft off the same row.
//
// Split out of useColonyCanvas.ts for invariant 7's 250-line cap. Writes into a ref and
// asks for a repaint rather than holding React state — the callout is a drawing, and
// re-rendering the whole map screen to move a dashed line would be silly.
export function usePlotDimensions(
  client: SupabaseClient,
  colonyId: string,
  selectedId: string | null,
  target: RefObject<PlotDimensions | null>,
  repaint: () => void,
): void {
  useEffect(() => {
    target.current = null;
    repaint();
    if (!selectedId) return;
    let cancelled = false;
    void fetchPlotBySvgId(client, colonyId, selectedId)
      .then((plot) => {
        if (cancelled || !plot) return;
        target.current = {
          plotId: selectedId,
          lengthFt: plot.length_ft,
          breadthFt: plot.breadth_ft,
        };
        repaint();
      })
      .catch((error: unknown) => {
        console.error("failed to load plot dimensions:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [client, colonyId, selectedId, target, repaint]);
}
