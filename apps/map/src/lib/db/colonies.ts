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
