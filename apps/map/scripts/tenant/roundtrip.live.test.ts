// Live round trip against the LOCAL Docker stack only (docs/plans/38.md §5). GATED: it TRUNCATES
// the local tenant tables to stand in for "an empty target", so it runs only when asked:
//   TENANT_ROUNDTRIP=1 pnpm exec vitest run scripts/tenant/roundtrip.live.test.ts
// then restore the fixture colony (see CLAUDE.md `make db-reseed`). It refuses to run unless every
// host it would touch is loopback.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../../src/lib/db/client.ts";
import { connect, isLoopback, type TenantEnv } from "./connect.ts";
import { exportTenant } from "./exportTenant.ts";
import { readFingerprints } from "./fingerprint.ts";
import { importTenant } from "./importTenant.ts";

const env: TenantEnv = {
  databaseUrl: process.env.TENANT_LOCAL_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  supabaseUrl: process.env.VITE_SUPABASE_URL ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
const BIG = "9007199254740993"; // 2^53 + 1: not representable as a JS number
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const out = path.join(os.tmpdir(), `tenant-rt-${randomUUID()}`);
const quiet = () => undefined;
const orgId = randomUUID();
const WIPE = "truncate public.plot_history, public.plots, public.colonies, public.organizations, auth.users cascade";

async function q(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await connect(env);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.end();
  }
}
const n = async (sql: string, params: unknown[] = []) => Number((await q(sql, params))[0].n);

describe.skipIf(!process.env.TENANT_ROUNDTRIP)("tenant export/import round trip (local stack)", () => {
  const admin = createDbClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });
  let token = "";

  beforeAll(() => {
    // Everything below truncates and writes: only ever the local stack.
    expect(isLoopback(new URL(env.databaseUrl).hostname)).toBe(true);
    expect(isLoopback(new URL(env.supabaseUrl).hostname)).toBe(true);
  });
  afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

  async function wipeTarget() {
    await q(WIPE);
    await admin.storage.from("colony-backdrops").remove(["rt-colony.png"]);
  }

  it("seeds, exports, wipes, dry-runs, imports, and refuses a second import", async () => {
    await q(WIPE);
    await q("insert into organizations (id, name) values ($1, 'Round trip org')", [orgId]);
    const svg1 = "<svg>" + Array.from({ length: 26 }, (_, i) => `<path id="plot-A-${i + 1}"/>`).join("") + "</svg>";
    const svg2 = '<svg><path id="plot-B-1"/><path id="plot-B-2"/></svg>';
    const colonies: [string, string, string | null][] = [["rt-colony", svg1, "rt-colony.png"], ["rt-colony-2", svg2, null]];
    for (const [id, svg, backdrop] of colonies) {
      await q(
        "insert into colonies (id, name, verified, svg, org_id, public_token, backdrop_storage_path) values ($1, $1, true, $2, $3, gen_random_uuid(), $4)",
        [id, svg, orgId, backdrop],
      );
    }
    const sizes: [string, string, number][] = [["rt-colony", "A", 26], ["rt-colony-2", "B", 2]];
    for (const [colony, block, count] of sizes) {
      for (let i = 1; i <= count; i++) {
        const p = await q(
          `insert into plots (colony_id, svg_id, block, number, area_sqft, facing, is_corner, updated_by, org_id, rate_paise, length_ft, breadth_ft)
           values ($1, $2, $3, $4, 1000, 'north', false, 'seed', $5, $6, 40, 25) returning id`,
          [colony, `plot-${block}-${i}`, block, String(i), orgId, BIG],
        );
        for (const s of ["booked", "available", "registered"]) {
          await q(
            "insert into plot_history (plot_id, status, changed_by, org_id, changed_at) values ($1, $2, 'seed', $3, '2026-01-02 03:04:05.123456+00')",
            [p[0].id, s, orgId],
          );
        }
      }
    }
    token = String((await q("select public_token::text as t from colonies where id = 'rt-colony'"))[0].t);
    const up = await admin.storage.from("colony-backdrops").upload("rt-colony.png", PNG, { contentType: "image/png", upsert: true });
    expect(up.error).toBeNull();
    for (const name of ["rt-one", "rt-two"]) {
      const r = await admin.auth.admin.createUser({
        email: `${name}@colony.local`, password: "Round-Trip-1!", email_confirm: true, app_metadata: { org_id: orgId },
      });
      expect(r.error).toBeNull();
    }
    await q("update auth.users set recovery_token = 'pending-token' where email = 'rt-one@colony.local'");

    const m = await exportTenant(env, { orgId, outDir: out, verifySource: true, log: quiet });
    expect(m.counts.tables["public.plots"]).toBe(28);
    expect(m.counts.tables["public.plot_history"]).toBe(84);
    expect(m.counts.perColony["rt-colony"]).toEqual({ plots: 26, history: 78 });
    expect(m.counts.perColony["rt-colony-2"]).toEqual({ plots: 2, history: 6 });
    expect(m.storage).toHaveLength(1);

    await wipeTarget();
    await importTenant(env, { inDir: out, dryRun: true, log: quiet });
    expect(await n("select count(*)::text as n from public.plots")).toBe(0);
    expect(await n("select count(*)::text as n from auth.users where email like 'rt-%'")).toBe(0);

    await importTenant(env, { inDir: out, dryRun: false, log: quiet });
    expect(await n("select count(*)::text as n from public.plot_history where org_id = $1", [orgId])).toBe(84);
    expect(await n("select count(*)::text as n from public.plots where rate_paise::text = $1", [BIG])).toBe(28);
    expect(await n("select count(*)::text as n from public.plot_history where changed_at = '2026-01-02 03:04:05.123456+00'")).toBe(84);
    // the SAME public token, working through the public RPC an anonymous visitor uses
    expect(String((await q("select public_token::text as t from colonies where id = 'rt-colony'"))[0].t)).toBe(token);
    const anon = createDbClient(env.supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false } });
    const pub = await anon.rpc("get_public_colony", { p_token: token });
    expect(pub.error).toBeNull();
    expect((pub.data as { found?: boolean }).found).toBe(true);
    // RLS intact on the target: an anonymous client reads no plots
    const anonPlots = await anon.from("plots").select("id");
    expect(anonPlots.data ?? []).toHaveLength(0);
    // member login with the original password; one-time token was not carried over
    const login = await anon.auth.signInWithPassword({ email: "rt-one@colony.local", password: "Round-Trip-1!" });
    expect(login.error).toBeNull();
    expect(String((await q("select recovery_token as t from auth.users where email = 'rt-one@colony.local'"))[0].t)).toBe("");
    // backdrop bytes through the PUBLIC url, as a browser would fetch them
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/public/colony-backdrops/rt-colony.png`);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);

    await expect(importTenant(env, { inDir: out, dryRun: false, log: quiet })).rejects.toThrow(/already holds data/);
    expect(await n("select count(*)::text as n from public.plot_history where org_id = $1", [orgId])).toBe(84);
  }, 240_000);

  it("a count mismatch rolls the whole import back to zero rows", async () => {
    await wipeTarget();
    const file = path.join(out, "manifest.json");
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    m.counts.tables["public.plots"] += 1;
    fs.writeFileSync(file, JSON.stringify(m));
    await expect(importTenant(env, { inDir: out, dryRun: false, log: quiet })).rejects.toThrow(/counts differ/);
    for (const t of ["public.organizations", "public.colonies", "public.plots", "public.plot_history", "auth.users"]) {
      expect(await n(`select count(*)::text as n from ${t}`)).toBe(0);
    }
    expect((await admin.storage.from("colony-backdrops").download("rt-colony.png")).error).not.toBeNull();
  });

  it("refuses an export with one byte changed, before writing anything", async () => {
    await wipeTarget();
    fs.appendFileSync(path.join(out, "public.plots.ndjson"), " ");
    await expect(importTenant(env, { inDir: out, dryRun: false, log: quiet })).rejects.toThrow(/sha256/);
    expect(await n("select count(*)::text as n from public.plots")).toBe(0);
  });

  it("the source fingerprint moves on an UPDATE that adds no rows", async () => {
    const m = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    const cols = Object.fromEntries(Object.entries(m.tables).map(([k, t]) => [k, (t as { columns: string[] }).columns]));
    const db = await connect(env);
    try {
      await db.query(WIPE);
      await db.query("insert into organizations (id, name) values ($1, 'fp')", [orgId]);
      const before = await readFingerprints(db, orgId, cols);
      await db.query("update organizations set name = 'fp-changed' where id = $1", [orgId]);
      const after = await readFingerprints(db, orgId, cols);
      expect(after["public.organizations"]).not.toBe(before["public.organizations"]);
      expect(after["public.plots"]).toBe(before["public.plots"]);
    } finally {
      await db.end();
    }
  });
});
