// Domain wrapper around fetchPublicColony (lib/db/colonies.ts) — DOM-free, same split as
// listColonies.ts/plotStatus.ts (docs/plans/22.md phase 2). PublicColonyView.tsx is the
// only caller of loadPublicColony.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchColonyById, fetchPublicColony } from "../db/colonies.ts";
import type { PublicColonyResult } from "../db/types.ts";

export async function loadPublicColony(
  client: SupabaseClient,
  token: string,
): Promise<PublicColonyResult> {
  return fetchPublicColony(client, token);
}

// docs/plans/23.md phase 3: promoted out of scripts/generate-public-link.ts's own inline
// logic once the admin portal needed the same action — one implementation, two callers
// (the script and the portal's server.ts). Not idempotent by design (D-031): regenerating
// invalidates whatever token the colony had before.
export async function regeneratePublicLink(
  client: SupabaseClient,
  colonyId: string,
): Promise<{ ok: true; token: string } | { ok: false; reason: "colony_not_found" }> {
  const existing = await fetchColonyById(client, colonyId);
  if (!existing) return { ok: false, reason: "colony_not_found" };

  // crypto.randomUUID() — the global Web Crypto API, available in both the browser bundle
  // this file ships in (tsconfig.app.json has no Node types) and in Node 19+, unlike
  // scripts/generate-public-link.ts's own `node:crypto` import, which only a Node-only
  // script can use.
  const token = crypto.randomUUID();
  const { error } = await client.from("colonies").update({ public_token: token }).eq("id", colonyId);
  if (error) throw new Error(`regeneratePublicLink failed: ${error.message}`);
  return { ok: true, token };
}

// docs/plans/23.md phase 3: makes docs/plans/22.md task H's hand-run SQL revocation a
// button instead. Idempotent — calling this on an already-revoked (or never-linked) colony
// is a no-op, matching "set this field to null" semantics.
export async function revokePublicLink(client: SupabaseClient, colonyId: string): Promise<void> {
  const { error } = await client.from("colonies").update({ public_token: null }).eq("id", colonyId);
  if (error) throw new Error(`revokePublicLink failed: ${error.message}`);
}
