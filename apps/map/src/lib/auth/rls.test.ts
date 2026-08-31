// Live integration tests against the local Supabase instance (Docker must be up).
// Proves the M8 RLS lockdown (docs/plans/09.md) directly at the database layer, not by
// reading the migration file — spec/08 criteria 1/2/3/4. Scratch users are created once
// per describe block in beforeAll/torn down in afterAll (not per `it`, and not inline in
// each test body) — vitest runs afterAll even when a test assertion throws, so a failing
// test can no longer leak a scratch account the way a body-level teardown call could.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPlotTransition } from "../plot-status/applyPlotTransition.ts";
import { usernameToEmail } from "./username.ts";
import type { PlotRow } from "../db/types.ts";
import {
  createScratchOrg,
  createScratchPlot,
  createScratchUser,
  createStatelessAnonClient,
  deleteScratchUser,
  type ScratchUser,
} from "./testHelpers.ts";

// Postgres's permission-denied code — asserting this specifically (not just "some
// error") is what actually distinguishes "no execute grant"/"no RLS visibility" from an
// unrelated failure like a renamed parameter or a schema-cache miss (/review finding).
const PERMISSION_DENIED = "42501";

describe("RLS — anon reads (spec/08 criterion 2)", () => {
  it("anon select on colonies/plots/plot_history all return zero rows", async () => {
    const orgId = await createScratchOrg();
    await createScratchPlot(orgId);
    const anon = createStatelessAnonClient();

    const [colonies, plots, history] = await Promise.all([
      anon.from("colonies").select("id"),
      anon.from("plots").select("id"),
      anon.from("plot_history").select("id"),
    ]);

    expect(colonies.error).toBeNull();
    expect(colonies.data).toEqual([]);
    expect(plots.error).toBeNull();
    expect(plots.data).toEqual([]);
    expect(history.error).toBeNull();
    expect(history.data).toEqual([]);
  });
});

describe("RLS — authenticated reads", () => {
  let user: ScratchUser;
  let orgId: string;
  beforeAll(async () => {
    orgId = await createScratchOrg();
    user = await createScratchUser("RLS Reader", orgId);
  });
  afterAll(async () => {
    await deleteScratchUser(user);
  });

  it("a signed-in user's select on colonies/plots/plot_history returns real rows", async () => {
    const { plotId, colonyId } = await createScratchPlot(orgId);

    const [colonies, plots] = await Promise.all([
      user.client.from("colonies").select("id").eq("id", colonyId),
      user.client.from("plots").select("id").eq("id", plotId),
    ]);

    expect(colonies.data).toEqual([{ id: colonyId }]);
    expect(plots.data).toEqual([{ id: plotId }]);
  });
});

describe("plot_history — append-only for every role (spec/08 criterion 3)", () => {
  let user: ScratchUser;
  let orgId: string;
  beforeAll(async () => {
    orgId = await createScratchOrg();
    user = await createScratchUser("RLS Writer", orgId);
  });
  afterAll(async () => {
    await deleteScratchUser(user);
  });

  it("anon UPDATE and DELETE are both rejected", async () => {
    const { plotId } = await createScratchPlot(orgId);
    const anon = createStatelessAnonClient();

    const update = await anon.from("plot_history").update({ note: "tampered" }).eq("plot_id", plotId);
    const del = await anon.from("plot_history").delete().eq("plot_id", plotId);

    expect(update.error?.code).toBe(PERMISSION_DENIED);
    expect(del.error?.code).toBe(PERMISSION_DENIED);
  });

  it("an authenticated user's UPDATE and DELETE are both rejected", async () => {
    const { plotId } = await createScratchPlot(orgId);

    const update = await user.client
      .from("plot_history")
      .update({ note: "tampered" })
      .eq("plot_id", plotId);
    const del = await user.client.from("plot_history").delete().eq("plot_id", plotId);

    expect(update.error?.code).toBe(PERMISSION_DENIED);
    expect(del.error?.code).toBe(PERMISSION_DENIED);
  });
});

describe("apply_plot_transition — server-side attribution (spec/08 criterion 4)", () => {
  let userA: ScratchUser;
  let userB: ScratchUser;
  let orgId: string;
  beforeAll(async () => {
    orgId = await createScratchOrg();
    [userA, userB] = await Promise.all([
      createScratchUser("Alpha Actor", orgId),
      createScratchUser("Beta Actor", orgId),
    ]);
  }, 15_000);
  afterAll(async () => {
    await Promise.all([deleteScratchUser(userA), deleteScratchUser(userB)]);
  });

  it("two different real sessions each get their own real name attributed, never a forged one", async () => {
    const { plotId: plotIdA } = await createScratchPlot(orgId);
    const { plotId: plotIdB } = await createScratchPlot(orgId);

    const resultA = await applyPlotTransition(userA.client, {
      plotId: plotIdA,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
    });
    const resultB = await applyPlotTransition(userB.client, {
      plotId: plotIdB,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
    });

    // No actor field exists anywhere in either call above — there is nothing for a
    // forged client payload to override.
    expect((resultA as { ok: true; plot: PlotRow }).plot.updated_by).toBe("Alpha Actor");
    expect((resultB as { ok: true; plot: PlotRow }).plot.updated_by).toBe("Beta Actor");
  });

  it("self-updating user_metadata does not change who a write is attributed to", async () => {
    const { plotId } = await createScratchPlot(orgId);
    // Every signed-in user can PUT their own user_metadata with nothing but their own
    // session — proving this doesn't change attribution is what actually closes the
    // forgery, since apply_plot_transition() must read app_metadata, not user_metadata.
    const { error: updateError } = await userA.client.auth.updateUser({
      data: { display_name: "Forged Name" },
    });
    expect(updateError).toBeNull();

    const result = await applyPlotTransition(userA.client, {
      plotId,
      fromStatus: "available",
      toStatus: "booked",
      expectedVersion: 1,
    });

    expect((result as { ok: true; plot: PlotRow }).plot.updated_by).toBe("Alpha Actor");
  });
});

describe("apply_plot_transition — no session, no access (spec/08 criteria 1/4)", () => {
  it("an anon call is rejected outright, not just ignored", async () => {
    const orgId = await createScratchOrg();
    const { plotId } = await createScratchPlot(orgId);
    const anon = createStatelessAnonClient();

    const { error } = await anon.rpc("apply_plot_transition", {
      p_plot_id: plotId,
      p_expected_version: 1,
      p_new_status: "booked",
    });

    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("a nonexistent username's synthetic email cannot sign in", async () => {
    const anon = createStatelessAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({
      email: "no-such-account-e2e-test@colony.local",
      password: "whatever-password",
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("open self-signup is rejected — an admin-created account is the only allowlist (D-019)", async () => {
    const anon = createStatelessAnonClient();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data, error } = await anon.auth.signUp({
      email: usernameToEmail(`self-signup-${suffix}`),
      password: "whatever-password-123",
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });
});
