import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColonyInsert, ColonyRow } from "./types.ts";

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
