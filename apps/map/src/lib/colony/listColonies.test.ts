import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadVerifiedColonies } from "./listColonies.ts";
import { getBrowserDbClient } from "../db/browserClient.ts";
import { insertColony } from "../db/colonies.ts";

// Live integration test against the local Supabase instance (Docker must be up — same
// requirement as pnpm import:seed). Proves D-108 at the list level: an unverified colony
// must never appear in the home-screen picker's options, not just be refused once opened.
async function createScratchColony(
  client: SupabaseClient,
  verified: boolean,
): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-list-colonies-${suffix}`;
  await insertColony(client, {
    id: colonyId,
    name: `list-colonies scratch (${verified ? "verified" : "unverified"})`,
    verified,
  });
  return colonyId;
}

// The `colonies` table has no DELETE grant (M2) — scratch rows are normally harmless
// residue cleared by the next `supabase db reset`, but a `verified: true` row is no
// longer harmless now that the home screen lists every verified colony (/review
// finding). Bypasses the TS wrapper on purpose, same precedent as
// applyPlotTransition.test.ts's forced-failure test — flips the scratch row back to
// unverified so it never lingers in the real picker between test runs.
async function revokeVerification(client: SupabaseClient, colonyId: string): Promise<void> {
  const { error } = await client.from("colonies").update({ verified: false }).eq("id", colonyId);
  if (error) throw new Error(`revokeVerification failed: ${error.message}`);
}

describe("loadVerifiedColonies — D-108 list-level gate", () => {
  it("includes a verified scratch colony and the real shree-vatika-2 colony, excludes an unverified one", async () => {
    const client = getBrowserDbClient();
    const verifiedId = await createScratchColony(client, true);
    const unverifiedId = await createScratchColony(client, false);

    try {
      const colonies = await loadVerifiedColonies(client);
      const ids = colonies.map((c) => c.id);

      expect(ids).toContain(verifiedId);
      expect(ids).toContain("shree-vatika-2");
      expect(ids).not.toContain(unverifiedId);
    } finally {
      await revokeVerification(client, verifiedId);
    }
  });
});
