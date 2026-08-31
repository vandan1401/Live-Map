// Split out of rls.test.ts (docs/plans/21.md phase 1), which had grown past invariant 7's
// 250-line cap once this describe block was added — not a separate concern, the same
// live-integration RLS proof as rls.test.ts, just in its own file for size. The
// acceptance-critical test for that whole plan: two real, independently created scratch
// orgs; each org's own signed-in user must see zero rows for the *other* org's colony/
// plot, and every security-definer RPC that looks up a row by client-supplied id must
// independently refuse a cross-org attempt — RLS alone does not reach inside one
// (docs/plans/21.md §3's pinned constraint; /review flagged the first two RPCs as untested).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulkImportInitialPlotData } from "../colony/bulkImportInitialPlotData.ts";
import { createColonyFromManifest } from "../colony/createColonyFromManifest.ts";
import { loadPublicColony } from "../colony/publicColony.ts";
import {
  createScratchOrg,
  createScratchPlot,
  createScratchUser,
  createStatelessAnonClient,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "./testHelpers.ts";

describe("RLS — cross-org isolation (docs/plans/21.md phase 1)", () => {
  let orgA: string;
  let orgB: string;
  let userA: ScratchUser;
  let userB: ScratchUser;
  let plotIdA: string;
  let colonyIdA: string;
  let plotIdB: string;
  let colonyIdB: string;
  let svgIdB: string;

  beforeAll(async () => {
    [orgA, orgB] = await Promise.all([createScratchOrg(), createScratchOrg()]);
    [userA, userB] = await Promise.all([
      createScratchUser("Org A User", orgA),
      createScratchUser("Org B User", orgB),
    ]);
    [
      { plotId: plotIdA, colonyId: colonyIdA },
      { plotId: plotIdB, colonyId: colonyIdB, svgId: svgIdB },
    ] = await Promise.all([createScratchPlot(orgA), createScratchPlot(orgB)]);
  }, 15_000);
  afterAll(async () => {
    await Promise.all([deleteScratchUser(userA), deleteScratchUser(userB)]);
    // docs/plans/22.md phase 2's own test below flips colonyIdA to verified: true and sets
    // a real public_token — undo both, same posture as createColonyFromManifest.test.ts's
    // own cleanup, or this scratch colony leaks into the real ColonyPicker's list forever
    // (colonies has no DELETE grant for any role) with a live public link still attached.
    const admin = serviceRoleClient();
    const { error } = await admin
      .from("colonies")
      .update({ verified: false, public_token: null })
      .eq("id", colonyIdA);
    if (error) throw new Error(`cleanup failed to unverify scratch colony: ${error.message}`);
  });

  it("anon select on organizations returns zero rows", async () => {
    const anon = createStatelessAnonClient();
    const { error, data } = await anon.from("organizations").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a user's select never returns another org's colony or plot rows", async () => {
    const [coloniesFromB, plotsFromB] = await Promise.all([
      userA.client.from("colonies").select("id").eq("id", colonyIdB),
      userA.client.from("plots").select("id").eq("id", plotIdB),
    ]);
    expect(coloniesFromB.error).toBeNull();
    expect(coloniesFromB.data).toEqual([]);
    expect(plotsFromB.error).toBeNull();
    expect(plotsFromB.data).toEqual([]);

    const [coloniesFromA, plotsFromA] = await Promise.all([
      userB.client.from("colonies").select("id").eq("id", colonyIdA),
      userB.client.from("plots").select("id").eq("id", plotIdA),
    ]);
    expect(coloniesFromA.error).toBeNull();
    expect(coloniesFromA.data).toEqual([]);
    expect(plotsFromA.error).toBeNull();
    expect(plotsFromA.data).toEqual([]);
  });

  it("apply_plot_transition against another org's plot id is refused, not a silent no-op", async () => {
    const { error } = await userA.client.rpc("apply_plot_transition", {
      p_plot_id: plotIdB,
      p_expected_version: 1,
      p_new_status: "booked",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("not authorized for this organization");
  });

  it("bulk_set_initial_plot_data against another org's colony/svg_id skips it as unknown, writes nothing", async () => {
    const result = await bulkImportInitialPlotData(userA.client, colonyIdB, [
      {
        svg_id: svgIdB,
        status: "booked",
        owner_name: "Should Not Land",
        owner_phone: null,
        broker_name: null,
        rate_paise: null,
        booking_amount_paise: null,
        booking_date: null,
        registry_date: null,
        notes: null,
      },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ svgId: svgIdB, reason: "unknown svg_id" }]);
  });

  it("create_colony_from_manifest replace against another org's colony id is refused with org_mismatch", async () => {
    const result = await createColonyFromManifest(
      userA.client,
      {
        colony: {
          id: colonyIdB,
          name: "Attempted cross-org replace",
          verified: false,
          generated: "2026-08-31",
          source: { file: "test.dxf" },
        },
        plots: [],
      },
      "<svg></svg>",
      true,
    );
    expect(result).toEqual({ ok: false, reason: "org_mismatch" });
  });

  it("get_public_colony (docs/plans/22.md phase 2) deliberately does not check org — a valid token reads regardless of org membership", async () => {
    const admin = serviceRoleClient();
    const token = crypto.randomUUID();
    const { error } = await admin
      .from("colonies")
      .update({ verified: true, public_token: token })
      .eq("id", colonyIdA);
    if (error) throw new Error(`test setup: could not set public_token: ${error.message}`);

    // A genuinely unauthenticated client — not userB, not any signed-in account from any
    // org. Proves this RPC's authorization boundary is the token alone, not org
    // membership, unlike every other RPC in this suite.
    const anon = createStatelessAnonClient();
    const { data: session } = await anon.auth.getSession();
    expect(session.session).toBeNull();

    const result = await loadPublicColony(anon, token);
    expect(result.found).toBe(true);
  });
});
