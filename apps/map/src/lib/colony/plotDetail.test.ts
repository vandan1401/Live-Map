import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlotDetail } from "./plotDetail.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";
import {
  createScratchOrg,
  createScratchUser,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../auth/testHelpers.ts";

// Live integration test against the local Supabase instance (Docker must be up — same
// requirement as pnpm import:seed). Matching gate to plotStatus.test.ts's — D-108 must
// hold for the detail sheet's read path too. orgId (docs/plans/21.md phase 1) must match
// the reading user's own org.
async function createScratchColony(
  client: SupabaseClient,
  orgId: string,
  verified: boolean,
): Promise<{ colonyId: string; svgId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-verified-gate-detail-${suffix}`;
  const svgId = `plot-A-${suffix.slice(0, 8)}`;
  await insertColony(client, {
    id: colonyId,
    org_id: orgId,
    name: "verified-gate scratch",
    verified,
    svg: "<svg></svg>",
  });
  await insertPlots(client, [
    {
      colony_id: colonyId,
      org_id: orgId,
      svg_id: svgId,
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
  return { colonyId, svgId };
}

// The `colonies` table has no DELETE grant (M2) — a `verified: true` scratch row now
// shows up in the real home-screen picker (/review finding), not just in this test's own
// query. Bypasses the TS wrapper on purpose, same precedent as
// applyPlotTransition.test.ts's forced-failure test.
async function revokeVerification(client: SupabaseClient, colonyId: string): Promise<void> {
  const { error } = await client.from("colonies").update({ verified: false }).eq("id", colonyId);
  if (error) throw new Error(`revokeVerification failed: ${error.message}`);
}

describe("loadPlotDetail — unverified colony gate (D-108)", () => {
  // Shared across both tests (applyPlotTransition.test.ts's precedent, a past /review
  // finding — per-test create+delete multiplies Auth-container contention under a full
  // parallel suite run; both tests only read, so sharing one reader is safe).
  let user: ScratchUser;
  let orgId: string;
  beforeAll(async () => {
    orgId = await createScratchOrg();
    user = await createScratchUser("Plot Detail Reader", orgId);
  }, 15_000);
  afterAll(async () => {
    await deleteScratchUser(user);
  });

  it("returns null for a plot in an unverified colony", async () => {
    const admin = serviceRoleClient();
    const { colonyId, svgId } = await createScratchColony(admin, orgId, false);

    const detail = await loadPlotDetail(user.client, colonyId, svgId);
    expect(detail).toBeNull();
  });

  it("returns the plot for a verified colony", async () => {
    const admin = serviceRoleClient();
    const { colonyId, svgId } = await createScratchColony(admin, orgId, true);

    try {
      const detail = await loadPlotDetail(user.client, colonyId, svgId);

      expect(detail?.plot.svg_id).toBe(svgId);
    } finally {
      await revokeVerification(admin, colonyId);
    }
  });
});
