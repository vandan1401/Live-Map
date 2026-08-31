import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColonyInsert, ColonyManifestPlot, ColonyRow, CreateColonyResult } from "./types.ts";

export async function insertColony(
  client: SupabaseClient,
  colony: ColonyInsert,
): Promise<ColonyRow> {
  const { data, error } = await client
    .from("colonies")
    .insert(colony)
    .select()
    .single();
  if (error) throw new Error(`insertColony failed: ${error.message}`);
  return data as ColonyRow;
}

// M6 share summary needs the colony's display name, not just its id.
export async function fetchColonyById(
  client: SupabaseClient,
  colonyId: string,
): Promise<ColonyRow | null> {
  const { data, error } = await client
    .from("colonies")
    .select("*")
    .eq("id", colonyId)
    .maybeSingle();
  if (error) throw new Error(`fetchColonyById failed: ${error.message}`);
  return (data as ColonyRow | null) ?? null;
}

// The home-screen picker's list — D-108 applies here too: an unverified colony must be
// invisible in the list, not just refused once opened (see lib/colony/listColonies.ts).
export async function fetchVerifiedColonies(client: SupabaseClient): Promise<ColonyRow[]> {
  const { data, error } = await client.from("colonies").select("*").eq("verified", true);
  if (error) throw new Error(`fetchVerifiedColonies failed: ${error.message}`);
  return (data as ColonyRow[] | null) ?? [];
}

// The only place create_colony_from_manifest() is called (docs/plans/11.md, D-025) — the
// only place `.rpc("create_colony_from_manifest", ...)` may appear (NAVIGATION.md's
// "supabase.from/.rpc only in lib/db/" rule). Domain shaping (manifest -> args) happens
// one layer up in lib/colony/createColonyFromManifest.ts, same split as
// bulkImportInitialPlotData.ts / plots.ts's callBulkSetInitialPlotData.
export async function callCreateColonyFromManifest(
  client: SupabaseClient,
  args: {
    colonyId: string;
    colonyName: string;
    sourceFile: string;
    generated: string;
    svg: string;
    plots: ColonyManifestPlot[];
    replace: boolean;
    zoomRefWidthPx?: number;
    zoomRefHeightPx?: number;
  },
): Promise<CreateColonyResult> {
  const { data, error } = await client.rpc("create_colony_from_manifest", {
    p_colony_id: args.colonyId,
    p_colony_name: args.colonyName,
    p_source_file: args.sourceFile,
    p_generated: args.generated,
    p_svg: args.svg,
    p_plots: args.plots,
    p_replace: args.replace,
    p_zoom_ref_width_px: args.zoomRefWidthPx ?? null,
    p_zoom_ref_height_px: args.zoomRefHeightPx ?? null,
  });
  if (error) throw new Error(`callCreateColonyFromManifest failed: ${error.message}`);
  const result = data as
    | { ok: true; colony_id: string }
    | { ok: false; reason: "colony_exists" }
    | { ok: false; reason: "would_orphan_history"; missing_svg_ids: string[] }
    | { ok: false; reason: "org_mismatch" };
  if (result.ok) return { ok: true, colonyId: result.colony_id };
  if (result.reason === "colony_exists") return { ok: false, reason: "colony_exists" };
  if (result.reason === "org_mismatch") return { ok: false, reason: "org_mismatch" };
  return { ok: false, reason: "would_orphan_history", missingSvgIds: result.missing_svg_ids };
}
