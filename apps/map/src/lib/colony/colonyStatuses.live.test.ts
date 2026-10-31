import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createColonyFromManifest } from "./createColonyFromManifest.ts";
import { applyPlotTransition } from "../plot-status/applyPlotTransition.ts";
import { callApplyPlotTransition } from "../db/plotTransitions.ts";
import { fetchColonyById, fetchPublicColony } from "../db/colonies.ts";
import { callBulkSetInitialPlotData, fetchPlotBySvgId } from "../db/plots.ts";
import { fetchPlotHistory } from "../db/plotHistory.ts";
import {
  createScratchOrg,
  createScratchUser,
  createStatelessAnonClient,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../auth/testHelpers.ts";
import type { ColonyManifest, ColonyStatus } from "../db/types.ts";

// docs/plans/40.md: per-colony statuses, proved live against the local Docker Supabase — the
// membership guard, the replace-time refusal, the public payload, and the concurrency path all
// live in SQL, so none of it can be proved by reading the migration. Same scratch-colony
// hygiene as createColonyFromManifest.test.ts: colonies have no DELETE grant, so every colony
// this file creates is flipped back to verified: false afterwards.
const INVESTORS: ColonyStatus[] = [
  { key: "available", label: "Available", colour: "#aa8800" },
  { key: "booked", label: "Booked", colour: "#2244cc" },
  { key: "registered", label: "Registry done", colour: "#cc1144" },
  { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
];

const createdColonyIds: string[] = [];
function newColonyId(): string {
  const id = `test-statuses-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdColonyIds.push(id);
  return id;
}

function manifest(colonyId: string, statuses?: ColonyStatus[]): ColonyManifest {
  const plots = ["01", "02"].map((n) => ({
    svg_id: `plot-A-${n}`,
    block: "A",
    number: n,
    area_sqft: 1200,
    length_ft: 30,
    breadth_ft: 40,
    facing: "north" as const,
    is_corner: false,
  }));
  return {
    colony: {
      id: colonyId,
      name: "Statuses Test Colony",
      verified: false,
      generated: "2026-10-27",
      source: { file: "test.dxf" },
      ...(statuses ? { statuses } : {}),
    },
    plots,
  };
}

const SVG = `<svg><path id="plot-A-01"/><path id="plot-A-02"/></svg>`;

describe("per-colony statuses — live integration (docs/plans/40.md)", () => {
  let user: ScratchUser;
  beforeAll(async () => {
    user = await createScratchUser("Statuses Tester", await createScratchOrg());
  }, 15_000);
  afterAll(async () => {
    await deleteScratchUser(user);
    if (createdColonyIds.length > 0) {
      const { error } = await serviceRoleClient()
        .from("colonies")
        .update({ verified: false })
        .in("id", createdColonyIds);
      if (error) throw new Error(`cleanup failed to unverify scratch colonies: ${error.message}`);
    }
  });

  async function upload(statuses?: ColonyStatus[]) {
    const colonyId = newColonyId();
    const result = await createColonyFromManifest(user.client, manifest(colonyId, statuses), SVG, false);
    expect(result.ok).toBe(true);
    return colonyId;
  }

  it("stores the declared list on the colony, and a colony that declares none keeps null", async () => {
    const withList = await upload(INVESTORS);
    expect((await fetchColonyById(user.client, withList))?.statuses).toEqual(INVESTORS);
    const without = await upload();
    expect((await fetchColonyById(user.client, without))?.statuses).toBeNull();
  });

  it("moves a plot available -> sold_to_investors -> available, one history row each", async () => {
    const colonyId = await upload(INVESTORS);
    const plot = (await fetchPlotBySvgId(user.client, colonyId, "plot-A-01"))!;

    const sold = await applyPlotTransition(user.client, {
      plotId: plot.id, fromStatus: "available", toStatus: "sold_to_investors",
      expectedVersion: plot.version, statuses: INVESTORS,
    });
    expect(sold.ok && sold.plot.status).toBe("sold_to_investors");
    if (!sold.ok) return;

    const back = await applyPlotTransition(user.client, {
      plotId: plot.id, fromStatus: "sold_to_investors", toStatus: "available",
      expectedVersion: sold.plot.version, statuses: INVESTORS,
    });
    expect(back.ok).toBe(true);

    const history = await fetchPlotHistory(user.client, plot.id);
    expect(history.map((h) => h.status).sort()).toEqual(
      ["available", "available", "sold_to_investors"].sort(),
    );
  });

  it("keeps the booked-for owner and the broker through registered, sold_to_investors and back (docs/plans/41.md)", async () => {
    const colonyId = await upload(INVESTORS);
    let plot = (await fetchPlotBySvgId(user.client, colonyId, "plot-A-01"))!;
    const { error } = await serviceRoleClient().from("plots").update({ broker_name: "Vikas Patel" }).eq("id", plot.id);
    if (error) throw new Error(`setup failed to set broker_name: ${error.message}`);
    plot = (await fetchPlotBySvgId(user.client, colonyId, "plot-A-01"))!;

    // Only the first move names a buyer; every later move omits ownerName, as the UI does.
    const chain: [string, string, string | undefined][] = [
      ["available", "booked", "Rajesh Shah"],
      ["booked", "registered", undefined],
      ["registered", "sold_to_investors", undefined],
      ["sold_to_investors", "booked", undefined],
      ["booked", "sold_to_investors", undefined],
    ];
    for (const [from, to, ownerName] of chain) {
      const moved = await applyPlotTransition(user.client, {
        plotId: plot.id, fromStatus: from, toStatus: to, expectedVersion: plot.version,
        ownerName, statuses: INVESTORS,
      });
      if (!moved.ok) throw new Error(`${from} -> ${to} refused: ${moved.reason}`);
      expect(moved.plot.status).toBe(to);
      expect(moved.plot.owner_name).toBe("Rajesh Shah");
      expect(moved.plot.broker_name).toBe("Vikas Patel");
      plot = moved.plot;
    }
  });

  it("the database refuses a key the colony does not list — even from a forged call", async () => {
    const noList = await upload(); // built-in three only
    const plot = (await fetchPlotBySvgId(user.client, noList, "plot-A-01"))!;
    await expect(
      callApplyPlotTransition(user.client, {
        plotId: plot.id, expectedVersion: plot.version, newStatus: "sold_to_investors",
      }),
    ).rejects.toThrow(/unknown_status:sold_to_investors/);
    expect((await fetchPlotBySvgId(user.client, noList, "plot-A-01"))?.status).toBe("available");
  });

  it("two clients racing the same custom-status change: exactly one wins, the other conflicts", async () => {
    const colonyId = await upload(INVESTORS);
    const plot = (await fetchPlotBySvgId(user.client, colonyId, "plot-A-01"))!;
    const go = () =>
      applyPlotTransition(user.client, {
        plotId: plot.id, fromStatus: "available", toStatus: "sold_to_investors",
        expectedVersion: plot.version, statuses: INVESTORS,
      });
    const [a, b] = await Promise.all([go(), go()]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const loser = a.ok ? b : a;
    expect(!loser.ok && loser.reason).toBe("conflict");
  });

  it("refuses a replace that drops a status a plot still holds, and writes nothing", async () => {
    const colonyId = await upload(INVESTORS);
    const plot = (await fetchPlotBySvgId(user.client, colonyId, "plot-A-01"))!;
    await applyPlotTransition(user.client, {
      plotId: plot.id, fromStatus: "available", toStatus: "sold_to_investors",
      expectedVersion: plot.version, statuses: INVESTORS,
    });
    const dropped = INVESTORS.filter((s) => s.key !== "sold_to_investors");
    const result = await createColonyFromManifest(user.client, manifest(colonyId, dropped), SVG, true);
    expect(result).toEqual({ ok: false, reason: "status_in_use", status: "sold_to_investors", plotCount: 1 });
    expect((await fetchColonyById(user.client, colonyId))?.statuses).toEqual(INVESTORS);
  });

  it("a replace that omits statuses leaves the stored list untouched; one that supplies them replaces it", async () => {
    const colonyId = await upload(INVESTORS);
    const omitted = await createColonyFromManifest(user.client, manifest(colonyId), SVG, true);
    expect(omitted.ok).toBe(true);
    expect((await fetchColonyById(user.client, colonyId))?.statuses).toEqual(INVESTORS);

    const renamed = INVESTORS.map((s) => (s.key === "sold_to_investors" ? { ...s, label: "Investor sale" } : s));
    expect((await createColonyFromManifest(user.client, manifest(colonyId, renamed), SVG, true)).ok).toBe(true);
    expect((await fetchColonyById(user.client, colonyId))?.statuses).toEqual(renamed);
  });

  it("rejects a malformed list outright and creates no colony", async () => {
    const colonyId = newColonyId();
    const nine = Array.from({ length: 9 }, (_, i) => ({
      key: i === 0 ? "available" : `s${i}`, label: `S${i}`, colour: "#111111",
    }));
    const result = await createColonyFromManifest(user.client, manifest(colonyId, nine), SVG, false);
    expect(result).toEqual({ ok: false, reason: "invalid_statuses" });
    expect(await fetchColonyById(user.client, colonyId)).toBeNull();
  });

  it("rejects a list whose later entry has a null colour or a non-string key (types, not just patterns)", async () => {
    // Review finding: bool_and skips NULLs and ->> renders a JSON boolean as text, so these slipped
    // past the validator when it only matched patterns on a two-or-more-entry list.
    const available = { key: "available", label: "Available", colour: "#aa8800" };
    for (const bad of [
      { key: "extra", label: "Extra", colour: null },
      { key: true, label: "Extra", colour: "#111111" },
      { key: "extra", label: null, colour: "#111111" },
    ]) {
      const colonyId = newColonyId();
      const result = await createColonyFromManifest(
        user.client, manifest(colonyId, [available, bad] as unknown as ColonyStatus[]), SVG, false,
      );
      expect(result).toEqual({ ok: false, reason: "invalid_statuses" });
      expect(await fetchColonyById(user.client, colonyId)).toBeNull();
    }
  });

  it("carries the list to the public link payload, and accepts a custom status in bulk import", async () => {
    const colonyId = await upload(INVESTORS);
    const token = (await fetchColonyById(user.client, colonyId))!.public_token!;
    const publicResult = await fetchPublicColony(createStatelessAnonClient(), token);
    expect(publicResult.found && publicResult.colony.statuses).toEqual(INVESTORS);

    const bulk = await callBulkSetInitialPlotData(user.client, colonyId, [
      { svg_id: "plot-A-02", status: "sold_to_investors", owner_name: "Investor One",
        owner_phone: null, broker_name: null, rate_paise: null, booking_amount_paise: null,
        booking_date: null, registry_date: null, notes: null },
      { svg_id: "plot-A-01", status: "not_a_status", owner_name: null,
        owner_phone: null, broker_name: null, rate_paise: null, booking_amount_paise: null,
        booking_date: null, registry_date: null, notes: null },
    ]);
    expect(bulk.applied).toEqual(["plot-A-02"]);
    expect(bulk.skipped).toEqual([{ svgId: "plot-A-01", reason: "invalid status" }]);
  });
});
