// Domain wrapper around fetchPublicColony (lib/db/colonies.ts) — DOM-free, same split as
// listColonies.ts/plotStatus.ts (docs/plans/22.md phase 2). PublicColonyView.tsx is the
// only caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPublicColony } from "../db/colonies.ts";
import type { PublicColonyResult } from "../db/types.ts";

export async function loadPublicColony(
  client: SupabaseClient,
  token: string,
): Promise<PublicColonyResult> {
  return fetchPublicColony(client, token);
}
