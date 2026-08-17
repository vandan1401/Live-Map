// Domain wrapper around callCreateColonyFromManifest (lib/db/colonies.ts) — DOM-free,
// unit-testable against a fake client, same split as bulkImportInitialPlotData.ts
// (docs/plans/11.md, D-025). ColonyUploadScreen.tsx is the only caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import { callCreateColonyFromManifest } from "../db/colonies.ts";
import type { ColonyManifest, CreateColonyResult } from "../db/types.ts";

export async function createColonyFromManifest(
  client: SupabaseClient,
  manifest: ColonyManifest,
  svg: string,
  replace: boolean,
): Promise<CreateColonyResult> {
  return callCreateColonyFromManifest(client, {
    colonyId: manifest.colony.id,
    colonyName: manifest.colony.name,
    sourceFile: manifest.colony.source.file,
    generated: manifest.colony.generated,
    svg,
    // The seven fields the app actually consumes (docs/plans/11.md §1) — never the
    // manifest's centroid/confidence, which this app has no use for and the RPC has no
    // column for.
    plots: manifest.plots.map((plot) => ({
      svg_id: plot.svg_id,
      block: plot.block,
      number: plot.number,
      area_sqft: plot.area_sqft,
      length_ft: plot.length_ft,
      breadth_ft: plot.breadth_ft,
      facing: plot.facing,
      is_corner: plot.is_corner,
    })),
    replace,
  });
}
