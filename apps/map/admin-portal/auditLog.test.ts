// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audited, listAuditLog, AUDIT_MAX_LIMIT } from "./auditLog.ts";
import { createScratchOrg, createScratchUser, createStatelessAnonClient, serviceRoleClient } from "../src/lib/auth/testHelpers.ts";

// docs/plans/36.md: live proof of admin_audit_log's grants and of audited()'s write-ahead
// behaviour, against the real local Supabase (no mocks for the database, per this repo).
const entry = (action: string) => ({ actor: { id: null, name: "test" }, sourceIp: "127.0.0.1", action, targetId: `t-${action}` });

describe("admin_audit_log grants", () => {
  it("is unreadable and unwritable for anon", async () => {
    const anon = createStatelessAnonClient();
    const read = await anon.from("admin_audit_log").select("id").limit(1);
    expect(read.error).not.toBeNull();
    const write = await anon.from("admin_audit_log").insert({ action: "x", outcome: "ok" });
    expect(write.error).not.toBeNull();
  });

  it("is unreadable and unwritable for an authenticated non-admin", async () => {
    const user = await createScratchUser("Audit Probe", await createScratchOrg());
    const read = await user.client.from("admin_audit_log").select("id").limit(1);
    expect(read.error).not.toBeNull();
    const write = await user.client.from("admin_audit_log").insert({ action: "x", outcome: "ok" });
    expect(write.error).not.toBeNull();
  });

  it("accepts service_role inserts but rejects update and delete", async () => {
    const admin = serviceRoleClient();
    const inserted = await admin.from("admin_audit_log").insert({ action: "grant-probe", outcome: "ok" }).select("id").single();
    expect(inserted.error).toBeNull();
    const id = (inserted.data as { id: number }).id;
    expect((await admin.from("admin_audit_log").update({ action: "tampered" }).eq("id", id)).error).not.toBeNull();
    expect((await admin.from("admin_audit_log").delete().eq("id", id)).error).not.toBeNull();
  });
});

describe("audited()", () => {
  it("writes attempt then ok around a successful action", async () => {
    const admin = serviceRoleClient();
    const action = `ok-${Date.now()}`;
    expect(await audited(admin, entry(action), async () => 42)).toBe(42);
    const { data } = await admin.from("admin_audit_log").select("outcome").eq("target_id", `t-${action}`).order("id");
    expect((data as { outcome: string }[]).map((r) => r.outcome)).toEqual(["attempt", "ok"]);
  });

  it("writes attempt then error, with the message, when the action throws", async () => {
    const admin = serviceRoleClient();
    const action = `err-${Date.now()}`;
    await expect(audited(admin, entry(action), async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const { data } = await admin.from("admin_audit_log").select("outcome, detail").eq("target_id", `t-${action}`).order("id");
    const rows = data as { outcome: string; detail: { message?: string } }[];
    expect(rows.map((r) => r.outcome)).toEqual(["attempt", "error"]);
    expect(rows[1].detail.message).toBe("boom");
  });

  it("does not run the action when the attempt row cannot be written", async () => {
    const failing = { from: () => ({ insert: async () => ({ error: { message: "down" } }) }) } as unknown as SupabaseClient;
    const action = vi.fn(async () => "ran");
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(audited(failing, entry("x"), action)).rejects.toMatchObject({ status: 500 });
    silence.mockRestore();
    expect(action).not.toHaveBeenCalled();
  });
});

describe("listAuditLog", () => {
  it("clamps the limit, orders newest first and pages by before_id", async () => {
    const admin = serviceRoleClient();
    for (let i = 0; i < 3; i++) await admin.from("admin_audit_log").insert({ action: "page-probe", outcome: "ok" });
    const huge = await listAuditLog(admin, { limit: 100000 });
    expect(huge.length).toBeLessThanOrEqual(AUDIT_MAX_LIMIT);
    const two = await listAuditLog(admin, { limit: 2 });
    expect(two).toHaveLength(2);
    expect(two[0].id).toBeGreaterThan(two[1].id);
    const next = await listAuditLog(admin, { limit: 2, beforeId: two[1].id });
    expect(next.every((r) => r.id < two[1].id)).toBe(true);
  });
});
