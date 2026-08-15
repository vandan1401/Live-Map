import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadVerifiedColonies } from "./listColonies.ts";
import { insertColony } from "../db/colonies.ts";
import {
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
} from "../auth/testHelpers.ts";

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
  // Explicit timeout (subscribePlots.test.ts/applyPlotTransition.test.ts/rls.test.ts's
  // precedent) — createScratchUser's GoTrue admin.createUser + signInWithPassword calls
  // are bcrypt-heavy, and this test's default (vitest's 5000ms) was found flaking under
  // full parallel-suite contention on the local Docker Supabase stack, not a real bug.
  it("includes a verified scratch colony and the real shree-vatika-2 colony, excludes an unverified one", async () => {
    const admin = serviceRoleClient();
    const verifiedId = await createScratchColony(admin, true);
    const unverifiedId = await createScratchColony(admin, false);
    // Reads go through a real authenticated session (docs/plans/09.md) — anon is
    // filtered to zero rows by RLS regardless of `verified`, which would defeat this
    // test's whole purpose.
    const user = await createScratchUser("List Colonies Reader");

    try {
      const colonies = await loadVerifiedColonies(user.client);
      const ids = colonies.map((c) => c.id);

      expect(ids).toContain(verifiedId);
      expect(ids).toContain("shree-vatika-2");
      expect(ids).not.toContain(unverifiedId);
    } finally {
      await revokeVerification(admin, verifiedId);
      await deleteScratchUser(user);
    }
  }, 15_000);
});
