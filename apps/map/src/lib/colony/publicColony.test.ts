import { afterAll, describe, expect, it } from "vitest";
import { loadPublicColony, regeneratePublicLink, revokePublicLink } from "./publicColony.ts";
import {
  createScratchOrg,
  createStatelessAnonClient,
  serviceRoleClient,
} from "../auth/testHelpers.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";

// docs/plans/22.md phase 2: get_public_colony() live-integration proof, against a real
// scratch colony + real token — createScratchPlot (testHelpers.ts) defaults
// verified: false, which this RPC gates on, so a dedicated setup is used here instead.
const createdColonyIds: string[] = [];

async function scratchPublicColony(options: { verified: boolean }) {
  const admin = serviceRoleClient();
  const orgId = await createScratchOrg();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-public-${suffix}`;
  const svgId = `plot-A-${suffix.slice(0, 8)}`;
  createdColonyIds.push(colonyId);

  await insertColony(admin, {
    id: colonyId,
    org_id: orgId,
    name: "Public Link Scratch Colony",
    verified: options.verified,
    svg: `<svg><path id="${svgId}"/></svg>`,
    // docs/plans/26.md: a real (non-null) zoom-ref extent, so the "no PII/money column"
    // test below also proves these two round-trip through get_public_colony() unchanged.
    select_zoom_ref_width_px: 234,
    select_zoom_ref_height_px: 416,
  });
  await insertPlots(admin, [
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
      status: "booked",
      owner_name: "Real Buyer",
      owner_phone: "9999999999",
      broker_name: "Real Broker",
      rate_paise: 500000,
      booking_amount_paise: 100000,
      notes: "Should never leave the database via the public RPC.",
      updated_by: "test-setup",
    },
  ]);

  const { data, error } = await admin
    .from("colonies")
    .update({ public_token: crypto.randomUUID() })
    .eq("id", colonyId)
    .select("public_token")
    .single();
  if (error) throw new Error(`scratchPublicColony: token update failed: ${error.message}`);

  return { colonyId, svgId, token: (data as { public_token: string }).public_token };
}

// File-scoped, not inside a single describe() — /review (2026-08-31) found the
// regeneratePublicLink/revokePublicLink describe block below also pushes to
// createdColonyIds, but a describe-scoped afterAll only runs once ITS OWN suite finishes;
// with this hook nested inside the first describe, it ran (and cleared its job) before the
// second describe's scratch colonies existed, leaving them permanently verified: true with
// a live, resolving public_token.
afterAll(async () => {
  if (createdColonyIds.length === 0) return;
  const admin = serviceRoleClient();
  // colonies/plots carry no DELETE grant for any client role by design (invariant 4) —
  // service_role has it via BYPASSRLS, but matching this repo's existing convention
  // (createColonyFromManifest.test.ts) of leaving scratch rows unverified rather than
  // deleting them is enough: they simply never appear in any real list again.
  const { error } = await admin
    .from("colonies")
    .update({ verified: false, public_token: null })
    .in("id", createdColonyIds);
  if (error) throw new Error(`cleanup failed to unverify scratch colonies: ${error.message}`);
});

describe("get_public_colony — live integration", () => {
  it("returns colony + plot statuses for a real token, with no PII/money column anywhere", async () => {
    const { colonyId, svgId, token } = await scratchPublicColony({ verified: true });
    const anon = createStatelessAnonClient();

    const result = await loadPublicColony(anon, token);
    expect(result).toEqual({
      found: true,
      colony: {
        id: colonyId,
        name: "Public Link Scratch Colony",
        svg: expect.any(String),
        // docs/plans/26.md: the owner-drawn COL-ZOOM-REF extent, pure geometry.
        select_zoom_ref_width_px: 234,
        select_zoom_ref_height_px: 416,
      },
      // docs/plans/25.md: block/number/area_sqft/length_ft/breadth_ft — pure geometry,
      // never PII/money (see the forbidden-column loop below, unchanged).
      plots: [
        {
          svg_id: svgId,
          status: "booked",
          block: "A",
          number: "1",
          area_sqft: 1200,
          length_ft: 30,
          breadth_ft: 40,
        },
      ],
    });

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "owner_name",
      "owner_phone",
      "broker_name",
      "rate_paise",
      "booking_amount_paise",
      "booking_date",
      "registry_date",
      "notes",
      "updated_by",
      "org_id",
      "version",
      "Real Buyer",
      "Real Broker",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }, 15_000);

  it("returns found: false for a wrong/random token", async () => {
    const anon = createStatelessAnonClient();
    const result = await loadPublicColony(anon, crypto.randomUUID());
    expect(result).toEqual({ found: false });
  });

  it("returns found: false for a real token whose colony is not verified", async () => {
    const { token } = await scratchPublicColony({ verified: false });
    const anon = createStatelessAnonClient();
    const result = await loadPublicColony(anon, token);
    expect(result).toEqual({ found: false });
  }, 15_000);

  it("a revoked token (public_token set back to null) stops resolving", async () => {
    const { colonyId, token } = await scratchPublicColony({ verified: true });
    const anon = createStatelessAnonClient();
    expect((await loadPublicColony(anon, token)).found).toBe(true);

    const admin = serviceRoleClient();
    const { error } = await admin.from("colonies").update({ public_token: null }).eq("id", colonyId);
    if (error) throw new Error(`revoke failed: ${error.message}`);

    expect(await loadPublicColony(anon, token)).toEqual({ found: false });
  }, 15_000);

  it("works for a genuinely unauthenticated client with no sign-in call at all", async () => {
    // createStatelessAnonClient() never signs in — proving this RPC's whole point: no
    // session, no org membership needed, only the token.
    const { token } = await scratchPublicColony({ verified: true });
    const anon = createStatelessAnonClient();
    const { data: session } = await anon.auth.getSession();
    expect(session.session).toBeNull();

    const result = await loadPublicColony(anon, token);
    expect(result.found).toBe(true);
  }, 15_000);
});

// docs/plans/23.md phase 3: regeneratePublicLink/revokePublicLink promoted out of
// scripts/generate-public-link.ts — the admin portal's server.ts and the script are now
// both callers of the same implementation.
describe("regeneratePublicLink / revokePublicLink", () => {
  it("regenerates a token that resolves through get_public_colony, then revoke stops it", async () => {
    const { colonyId } = await scratchPublicColony({ verified: true });
    const admin = serviceRoleClient();
    const anon = createStatelessAnonClient();

    const result = await regeneratePublicLink(admin, colonyId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect((await loadPublicColony(anon, result.token)).found).toBe(true);

    await revokePublicLink(admin, colonyId);
    expect(await loadPublicColony(anon, result.token)).toEqual({ found: false });
  }, 15_000);

  it("returns colony_not_found for an unknown colony id, rather than throwing", async () => {
    const admin = serviceRoleClient();
    const result = await regeneratePublicLink(admin, "no-such-colony-id");
    expect(result).toEqual({ ok: false, reason: "colony_not_found" });
  });

  it("regenerating overwrites the previous token, invalidating it", async () => {
    const { colonyId } = await scratchPublicColony({ verified: true });
    const admin = serviceRoleClient();
    const anon = createStatelessAnonClient();

    const first = await regeneratePublicLink(admin, colonyId);
    const second = await regeneratePublicLink(admin, colonyId);
    if (!first.ok || !second.ok) throw new Error("unreachable");
    expect(first.token).not.toBe(second.token);

    expect(await loadPublicColony(anon, first.token)).toEqual({ found: false });
    expect((await loadPublicColony(anon, second.token)).found).toBe(true);
  }, 15_000);

  it("revoking an already-unlinked colony is a no-op, not an error", async () => {
    const { colonyId } = await scratchPublicColony({ verified: true });
    const admin = serviceRoleClient();
    await expect(revokePublicLink(admin, colonyId)).resolves.toBeUndefined();
    await expect(revokePublicLink(admin, colonyId)).resolves.toBeUndefined();
  }, 15_000);
});
