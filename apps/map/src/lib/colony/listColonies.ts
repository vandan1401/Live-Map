import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchVerifiedColonies } from "../db/colonies.ts";
import type { ColonyRow } from "../db/types.ts";

// Pure domain shaping — no DOM access. The list-level half of D-108: `plotStatus.ts` and
// `plotDetail.ts` already refuse to read a single unverified colony's plots; this is the
// same rule applied before a colony is even offered as a choice on the home screen.
export async function loadVerifiedColonies(client: SupabaseClient): Promise<ColonyRow[]> {
  return fetchVerifiedColonies(client);
}
