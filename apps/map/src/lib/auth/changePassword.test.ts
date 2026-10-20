import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changePassword, MIN_PASSWORD_LENGTH } from "./changePassword.ts";
import { MIN_PASSWORD_LENGTH as PORTAL_MIN } from "../../../admin-portal/actions.ts";

type Err = { code?: string; status?: number } | null;

// Records the order of every auth call across BOTH clients, so a test can assert the contract's
// sequence (verify, revoke the verify session, update, sign out others) and not just the outcome.
function fakes(opts: { verify?: Err; update?: Err; others?: Err | "throw" } = {}) {
  const calls: string[] = [];
  const verifyClient = {
    auth: {
      signInWithPassword: vi.fn(async () => {
        calls.push("verify.signIn");
        return { error: opts.verify ?? null };
      }),
      signOut: vi.fn(async (o: { scope: string }) => {
        calls.push(`verify.signOut:${o.scope}`);
        return { error: null };
      }),
    },
  } as unknown as SupabaseClient;
  const client = {
    auth: {
      updateUser: vi.fn(async () => {
        calls.push("live.updateUser");
        return { error: opts.update ?? null };
      }),
      signOut: vi.fn(async (o: { scope: string }) => {
        calls.push(`live.signOut:${o.scope}`);
        if (opts.others === "throw") throw new Error("network");
        return { error: opts.others ?? null };
      }),
    },
  } as unknown as SupabaseClient;
  return { client, verifyClient, calls };
}

const base = { email: "a@colony.local", current: "old-password", next: "new-password-1", confirm: "new-password-1" };

describe("MIN_PASSWORD_LENGTH", () => {
  it("equals the admin portal's rule (src/ cannot import it at runtime, so the two are pinned equal)", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(PORTAL_MIN);
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe("changePassword: validation needs no network", () => {
  it.each([
    [{ next: "short", confirm: "short" }, "too-short"],
    [{ next: "new-password-1", confirm: "different-1" }, "mismatch"],
    [{ next: "old-password", confirm: "old-password" }, "same"],
  ])("%j -> %s, with zero auth calls", async (over, reason) => {
    const f = fakes();
    const r = await changePassword({ ...f, ...base, ...over });
    expect(r).toMatchObject({ ok: false, reason });
    expect(f.calls).toEqual([]);
  });

  it("reports a short password before a mismatch", async () => {
    const f = fakes();
    const r = await changePassword({ ...f, ...base, next: "abc", confirm: "xyz" });
    expect(r).toMatchObject({ ok: false, reason: "too-short" });
  });

  it("accepts exactly 8 characters", async () => {
    const f = fakes();
    const r = await changePassword({ ...f, ...base, next: "12345678", confirm: "12345678" });
    expect(r.ok).toBe(true);
  });
});

describe("changePassword: the happy path and its order", () => {
  it("verifies, revokes the verify session, updates, then signs out OTHER devices only", async () => {
    const f = fakes();
    const r = await changePassword({ ...f, ...base });
    expect(r).toEqual({ ok: true, othersSignedOut: true });
    expect(f.calls).toEqual(["verify.signIn", "verify.signOut:local", "live.updateUser", "live.signOut:others"]);
  });

  it("a sign-out-others failure is still a success, never reported as a failed change", async () => {
    for (const others of [{ status: 500 } as Err, "throw" as const]) {
      const f = fakes({ others });
      const r = await changePassword({ ...f, ...base });
      expect(r).toEqual({ ok: true, othersSignedOut: false });
    }
  });
});

describe("changePassword: failures change nothing", () => {
  it("a dropped connection or a server error is NOT reported as a wrong password", async () => {
    for (const verify of [{ status: 0 }, { status: 502 }, { status: 500, code: "unexpected_failure" }, {}] as Err[]) {
      const f = fakes({ verify });
      const r = await changePassword({ ...f, ...base });
      expect(r).toMatchObject({ ok: false, reason: "failed" });
      expect(f.calls).toEqual(["verify.signIn"]);
    }
  });

  it("a wrong current password stops before any update", async () => {
    const f = fakes({ verify: { code: "invalid_credentials", status: 400 } });
    const r = await changePassword({ ...f, ...base });
    expect(r).toMatchObject({ ok: false, reason: "wrong-current", message: "Current password is incorrect." });
    expect(f.calls).toEqual(["verify.signIn"]);
  });

  it("a rate limit on verify or update is named, not mistaken for a wrong password", async () => {
    const a = await changePassword({ ...fakes({ verify: { status: 429 } }), ...base });
    const b = await changePassword({ ...fakes({ update: { code: "over_request_rate_limit" } }), ...base });
    expect(a).toMatchObject({ ok: false, reason: "rate-limited" });
    expect(b).toMatchObject({ ok: false, reason: "rate-limited" });
  });

  it.each([
    ["same_password", "same"],
    ["reauthentication_needed", "recent-login-needed"],
    ["reauthentication_not_valid", "recent-login-needed"],
    ["session_not_found", "recent-login-needed"],
    ["weak_password", "weak-password"],
    ["something_else", "failed"],
  ])("update error code %s -> %s, and the other devices are NOT signed out", async (code, reason) => {
    const f = fakes({ update: { code } });
    const r = await changePassword({ ...f, ...base });
    expect(r).toMatchObject({ ok: false, reason });
    expect(f.calls).not.toContain("live.signOut:others");
  });

  it("an AuthSessionMissingError (this device's own session is gone) says to sign in again", async () => {
    const f = fakes({ update: { name: "AuthSessionMissingError" } as Err });
    const r = await changePassword({ ...f, ...base });
    expect(r).toMatchObject({ ok: false, reason: "recent-login-needed" });
  });

  it("never puts a password or GoTrue's own error text into a message", async () => {
    // The fake errors CARRY a message, so a regression that passed GoTrue's text through would show.
    const withText = (e: object) => ({ ...e, message: "gotrue-internal-detail" }) as Err;
    for (const opts of [
      { verify: withText({ code: "invalid_credentials" }) },
      { verify: withText({ status: 500 }) },
      { update: withText({ code: "weak_password" }) },
      { update: withText({ code: "other" }) },
    ]) {
      const r = await changePassword({ ...fakes(opts), ...base });
      const text = JSON.stringify(r);
      expect(text).not.toContain("gotrue-internal-detail");
      expect(text).not.toContain(base.next);
      expect(text).not.toContain(base.current);
    }
  });
});
