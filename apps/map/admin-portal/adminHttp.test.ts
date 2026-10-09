// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLoginThrottle, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS } from "./auth.ts";
import { createScratchOrg, createStatelessAnonClient } from "../src/lib/auth/testHelpers.ts";
import { call, loginToken, makeUser, signInWithPasswordOk, startServer, type RunningServer, type TestUser } from "./testSupport.ts";

// docs/plans/36.md: the admin portal's authentication, throttle and user actions, driven over a
// real loopback socket against the real local Supabase.
vi.setConfig({ testTimeout: 20_000 });

let server: RunningServer;
let admin: TestUser;
let adminToken: string;
let orgId: string;

beforeAll(async () => {
  server = await startServer();
  admin = await makeUser({ superAdmin: true });
  adminToken = await loginToken(server.base, admin);
  orgId = await createScratchOrg();
});
afterAll(async () => {
  await server.close();
});

async function auditRows(targetId: string) {
  const { data } = await server.client.from("admin_audit_log").select("action, outcome, detail, actor_id").eq("target_id", targetId).order("id");
  return data as { action: string; outcome: string; detail: Record<string, unknown>; actor_id: string | null }[];
}

describe("authentication gate", () => {
  it("rejects a missing or garbage token with 401", async () => {
    expect((await call(server.base, "GET", "/api/organizations")).status).toBe(401);
    expect((await call(server.base, "GET", "/api/organizations", { token: "not-a-jwt" })).status).toBe(401);
  });

  it("rejects a valid non-admin with 403 and records a denied row", async () => {
    const plain = await makeUser({ orgId });
    const { data } = await createStatelessAnonClient().auth.signInWithPassword({ email: `${plain.username}@colony.local`, password: plain.password });
    const res = await call(server.base, "GET", "/api/organizations", { token: data.session?.access_token });
    expect(res.status).toBe(403);
    const { data: rows } = await server.client.from("admin_audit_log").select("outcome").eq("actor_id", plain.id);
    expect((rows as { outcome: string }[]).map((r) => r.outcome)).toContain("denied");
  });

  it("lets a super admin through", async () => {
    expect((await call(server.base, "GET", "/api/organizations", { token: adminToken })).status).toBe(200);
  });

  it("refuses to log in a non-admin and records a denied row", async () => {
    const plain = await makeUser({ orgId });
    const res = await call(server.base, "POST", "/api/login", { body: { username: plain.username, password: plain.password } });
    expect(res.status).toBe(403);
    expect(res.json.accessToken).toBeUndefined();
    const { data } = await server.client.from("admin_audit_log").select("action, outcome, detail").eq("actor_id", plain.id);
    expect(data).toEqual([{ action: "login", outcome: "denied", detail: { username: plain.username, reason: "not a super admin" } }]);
  });
});

describe("login throttle", () => {
  it("unit: blocks after 5 failures, expires after the window, clears on success", () => {
    let now = 1_000;
    const throttle = createLoginThrottle(() => now);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) throttle.recordFailure("1.1.1.1");
    expect(throttle.isBlocked("1.1.1.1")).toBe(true);
    expect(throttle.isBlocked("2.2.2.2")).toBe(false);
    now += LOGIN_WINDOW_MS;
    expect(throttle.isBlocked("1.1.1.1")).toBe(false);
    throttle.recordFailure("1.1.1.1");
    throttle.clear("1.1.1.1");
    expect(throttle.isBlocked("1.1.1.1")).toBe(false);
  });

  it("http: the 6th bad login is 429, and X-Forwarded-For does not dodge it", async () => {
    const fresh = await startServer();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < LOGIN_MAX_FAILURES + 1; i++) {
        const res = await call(fresh.base, "POST", "/api/login", {
          body: { username: admin.username, password: "wrong-password" },
          headers: { "X-Forwarded-For": `9.9.9.${i}` },
        });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    } finally {
      await fresh.close();
    }
  });
});

describe("user actions", () => {
  it("resets a password: the new one signs in, the old one does not; nothing secret is audited", async () => {
    const target = await makeUser({ orgId });
    const newPassword = `fresh-${Date.now()}-pw`;
    const res = await call(server.base, "POST", `/api/users/${target.id}/password`, { token: adminToken, body: { password: newPassword } });
    expect(res.status).toBe(200);
    expect(await signInWithPasswordOk(target.username, newPassword)).toBe(true);
    expect(await signInWithPasswordOk(target.username, target.password)).toBe(false);
    const rows = await auditRows(target.id);
    expect(rows.map((r) => `${r.action}:${r.outcome}`)).toEqual(["reset_password:attempt", "reset_password:ok"]);
    expect(JSON.stringify(rows)).not.toContain(newPassword);
    expect(rows[0].actor_id).toBe(admin.id);
  });

  it("rejects a short password with 400 and writes no audit row", async () => {
    const target = await makeUser({ orgId });
    const res = await call(server.base, "POST", `/api/users/${target.id}/password`, { token: adminToken, body: { password: "short" } });
    expect(res.status).toBe(400);
    expect(await auditRows(target.id)).toHaveLength(0);
    const create = await call(server.base, "POST", "/api/users", { token: adminToken, body: { username: `s-${Date.now()}`, password: "short", displayName: "S", orgId } });
    expect(create.status).toBe(400);
  });

  it("deactivates and reactivates", async () => {
    const target = await makeUser({ orgId });
    await call(server.base, "POST", `/api/users/${target.id}/active`, { token: adminToken, body: { active: false } });
    expect(await signInWithPasswordOk(target.username, target.password)).toBe(false);
    await call(server.base, "POST", `/api/users/${target.id}/active`, { token: adminToken, body: { active: true } });
    expect(await signInWithPasswordOk(target.username, target.password)).toBe(true);
  });

  it("deletes only with the right confirmation", async () => {
    const target = await makeUser({ orgId });
    const wrong = await call(server.base, "POST", `/api/users/${target.id}/delete`, { token: adminToken, body: { confirmUsername: "someone-else" } });
    expect(wrong.status).toBe(400);
    const ok = await call(server.base, "POST", `/api/users/${target.id}/delete`, { token: adminToken, body: { confirmUsername: target.username } });
    expect(ok.status).toBe(200);
    expect((await server.client.auth.admin.getUserById(target.id)).data.user).toBeNull();
    const rows = await auditRows(target.id);
    expect(rows.map((r) => r.outcome)).toEqual(["attempt", "error", "attempt", "ok"]);
  });

  it("refuses to act on yourself or on another super admin", async () => {
    const other = await makeUser({ superAdmin: true });
    const self = await call(server.base, "POST", `/api/users/${admin.id}/active`, { token: adminToken, body: { active: false } });
    expect(self.status).toBe(403);
    const peer = await call(server.base, "POST", `/api/users/${other.id}/password`, { token: adminToken, body: { password: "another-long-pw" } });
    expect(peer.status).toBe(403);
    const del = await call(server.base, "POST", `/api/users/${admin.id}/delete`, { token: adminToken, body: { confirmUsername: admin.username } });
    expect(del.status).toBe(403);
  });

  it("creates a user through the portal and cannot be talked into granting the role", async () => {
    const username = `c-${Date.now().toString(36)}`;
    const res = await call(server.base, "POST", "/api/users", { token: adminToken, body: { username, password: "created-pw-123", displayName: "C", orgId, role: "super_admin" } });
    expect(res.status).toBe(200);
    const id = (res.json.user as { id: string }).id;
    const created = (await server.client.auth.admin.getUserById(id)).data.user;
    expect(created?.app_metadata?.role).toBeUndefined();
  });

  it("serves the audit log newest first", async () => {
    const res = await call(server.base, "GET", "/api/audit-log?limit=5", { token: adminToken });
    expect(res.status).toBe(200);
    const ids = (res.json.rows as { id: number }[]).map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
  });
});

describe("audit coverage", () => {
  async function outcomesFor(action: string, key: string, value: string) {
    const { data } = await server.client.from("admin_audit_log").select("outcome").eq("actor_id", admin.id).eq("action", action).eq(`detail->>${key}`, value).order("id");
    return (data as { outcome: string }[]).map((r) => r.outcome);
  }

  it("create_user, create_org and deactivate each write attempt then ok", async () => {
    const username = `a-${Date.now().toString(36)}`;
    await call(server.base, "POST", "/api/users", { token: adminToken, body: { username, password: "audit-pw-12345", displayName: "A", orgId } });
    expect(await outcomesFor("create_user", "username", username)).toEqual(["attempt", "ok"]);

    const name = `org-${Date.now()}`;
    await call(server.base, "POST", "/api/organizations", { token: adminToken, body: { name } });
    expect(await outcomesFor("create_org", "name", name)).toEqual(["attempt", "ok"]);

    const target = await makeUser({ orgId });
    await call(server.base, "POST", `/api/users/${target.id}/active`, { token: adminToken, body: { active: false } });
    expect((await auditRows(target.id)).map((r) => `${r.action}:${r.outcome}`)).toEqual(["deactivate_user:attempt", "deactivate_user:ok"]);
  });

  it("a duplicate username and an already-deleted user are audited as errors, not ok", async () => {
    const username = `d-${Date.now().toString(36)}`;
    const body = { username, password: "dup-pw-12345", displayName: "D", orgId };
    expect((await call(server.base, "POST", "/api/users", { token: adminToken, body })).status).toBe(200);
    expect((await call(server.base, "POST", "/api/users", { token: adminToken, body })).status).toBe(500);
    expect(await outcomesFor("create_user", "username", username)).toEqual(["attempt", "ok", "attempt", "error"]);

    const gone = await makeUser({ orgId });
    await call(server.base, "POST", `/api/users/${gone.id}/delete`, { token: adminToken, body: { confirmUsername: gone.username } });
    expect((await call(server.base, "POST", `/api/users/${gone.id}/delete`, { token: adminToken, body: { confirmUsername: gone.username } })).status).toBe(404);
    expect((await auditRows(gone.id)).map((r) => r.outcome)).toEqual(["attempt", "ok", "attempt", "error"]);
  });

  it("a public-link call for a missing colony is a 404 audited as error", async () => {
    const colonyId = `no-such-colony-${Date.now()}`;
    expect((await call(server.base, "POST", `/api/colonies/${colonyId}/public-link`, { token: adminToken, body: {} })).status).toBe(404);
    expect((await auditRows(colonyId)).map((r) => r.outcome)).toEqual(["attempt", "error"]);
  });

  it("a backdrop route called with a method it does not own writes no audit row", async () => {
    const colonyId = `backdrop-probe-${Date.now()}`;
    expect((await call(server.base, "DELETE", `/api/colonies/${colonyId}/backdrop`, { token: adminToken, body: {} })).status).toBe(404);
    expect(await auditRows(colonyId)).toHaveLength(0);
  });
});
