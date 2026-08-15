import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlotStatuses } from "./plotStatus.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";
import {
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
} from "../auth/testHelpers.ts";

// Live integration test against the local Supabase instance (Docker must be up — same
// requirement as pnpm import:seed). Proves D-108: an unverified colony's plots must not
// be readable at render time, not just refused at import.
async function createScratchColony(
  client: SupabaseClient,
  verified: boolean,
): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-verified-gate-${suffix}`;
  await insertColony(client, { id: colonyId, name: "verified-gate scratch", verified });
  await insertPlots(client, [
    {
      colony_id: colonyId,
      svg_id: `plot-A-${suffix.slice(0, 8)}`,
      block: "A",
      number: "1",
      area_sqft: 1200,
      length_ft: 30,
      breadth_ft: 40,
      facing: "north",
      is_corner: false,
      status: "available",
      updated_by: "test-setup",
    },
  ]);
  return colonyId;
}

// The `colonies` table has no DELETE grant (M2) — a `verified: true` scratch row now
// shows up in the real home-screen picker (/review finding), not just in this test's own
// query. Bypasses the TS wrapper on purpose, same precedent as
// applyPlotTransition.test.ts's forced-failure test.
async function revokeVerification(client: SupabaseClient, colonyId: string): Promise<void> {
  const { error } = await client.from("colonies").update({ verified: false }).eq("id", colonyId);
  if (error) throw new Error(`revokeVerification failed: ${error.message}`);
}

describe("loadPlotStatuses — unverified colony gate (D-108)", () => {
  it("returns no statuses for an unverified colony", async () => {
    const admin = serviceRoleClient();
    const colonyId = await createScratchColony(admin, false);
    const user = await createScratchUser("Plot Status Reader");

    try {
      const statuses = await loadPlotStatuses(user.client, colonyId);
      expect(statuses).toEqual({});
    } finally {
      await deleteScratchUser(user);
    }
  });

  it("returns statuses for a verified colony", async () => {
    const admin = serviceRoleClient();
    const colonyId = await createScratchColony(admin, true);
    const user = await createScratchUser("Plot Status Reader");

    try {
      const statuses = await loadPlotStatuses(user.client, colonyId);

      expect(Object.keys(statuses)).toHaveLength(1);
    } finally {
      await revokeVerification(admin, colonyId);
      await deleteScratchUser(user);
    }
  });
});
