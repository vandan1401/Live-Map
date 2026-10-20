// Live integration against the LOCAL Docker stack only (docs/plans/39.md §5): a real GoTrue,
// real sessions. Disposable users in a scratch org, deleted afterwards (orgs are left, matching
// testHelpers' convention).
import { afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDbClient } from "../db/client.ts";
import { changePassword } from "./changePassword.ts";
import { createScratchOrg, serviceRoleClient } from "./testHelpers.ts";
import { usernameToEmail } from "./username.ts";

declare const process: { env: Record<string, string | undefined> };
const url = process.env.VITE_SUPABASE_URL ?? "";
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const TIMEOUT = 30_000; // several sequential auth round trips per test; the 5 s default flakes under load

// A client with its OWN storage key, so two of them in one file are genuinely two devices.
function device(name: string) {
  return createDbClient(url, anon, { auth: { storageKey: `sb-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } });
}
const stateless = () => createDbClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await serviceRoleClient().auth.admin.deleteUser(id);
});

async function freshUser() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = usernameToEmail(`cp-${suffix}`);
  const password = `old-${suffix}-pw`;
  const orgId = await createScratchOrg();
  const { data, error } = await serviceRoleClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { display_name: "CP Test", org_id: orgId },
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  created.push(data.user.id);
  return { email, password };
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  const { error } = await stateless().auth.signInWithPassword({ email, password });
  return error === null;
}

describe("changePassword: live integration", () => {
  it("a wrong current password is refused and the real password is unchanged", async () => {
    const { email, password } = await freshUser();
    const here = device("here");
    expect((await here.auth.signInWithPassword({ email, password })).error).toBeNull();

    const r = await changePassword({
      client: here, verifyClient: stateless(), email,
      current: "not-the-password", next: "brand-new-pass-1", confirm: "brand-new-pass-1",
    });
    expect(r).toMatchObject({ ok: false, reason: "wrong-current" });
    expect(await canSignIn(email, password)).toBe(true);
    expect(await canSignIn(email, "brand-new-pass-1")).toBe(false);
  }, TIMEOUT);

  it("changes the password: new works, old fails, this device stays in, the other device loses its session", async () => {
    const { email, password } = await freshUser();
    const here = device("here");
    const other = device("other");
    expect((await here.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect((await other.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect((await other.auth.getUser()).error).toBeNull(); // the other device is validly signed in

    const next = `brand-new-${Date.now()}`;
    const r = await changePassword({
      client: here, verifyClient: stateless(), email, current: password, next, confirm: next,
    });
    expect(r).toEqual({ ok: true, othersSignedOut: true });

    expect(await canSignIn(email, next)).toBe(true);
    expect(await canSignIn(email, password)).toBe(false);
    expect((await here.auth.getUser()).error).toBeNull(); // the changing device is still signed in
    // The SPECIFIC error: its session no longer exists on the server (not just "some error").
    // Note GoTrue's own password update already revokes other sessions, so this proves the end
    // state; changePassword.test.ts's call-order test is what pins the explicit sign-out step.
    expect((await other.auth.getUser()).error?.name).toBe("AuthSessionMissingError");
  }, TIMEOUT);

  it("the verify session cannot be refreshed after a failed update (revoked on the server)", async () => {
    const { email, password } = await freshUser();
    const verify = stateless();
    let refreshToken = "";
    verify.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) refreshToken = session.refresh_token;
    });
    // The update is forced to fail, so GoTrue's own password-change revocation never runs: only
    // changePassword's explicit signOut({scope: "local"}) can have revoked that session.
    const next = `never-applied-${Date.now()}`;
    const failingClient = {
      auth: {
        updateUser: async () => ({ error: { code: "forced_failure", status: 500 } }),
        signOut: async () => ({ error: null }),
      },
    } as unknown as SupabaseClient;
    const r = await changePassword({ client: failingClient, verifyClient: verify, email, current: password, next, confirm: next });
    expect(r).toMatchObject({ ok: false, reason: "failed" });
    expect(refreshToken).not.toBe("");
    const refreshed = await stateless().auth.refreshSession({ refresh_token: refreshToken });
    expect(refreshed.error).not.toBeNull(); // revoked server-side, not merely forgotten locally
    expect(await canSignIn(email, password)).toBe(true); // and the real password is untouched
  }, TIMEOUT);

  it("the same password is refused", async () => {
    const { email, password } = await freshUser();
    const here = device("here");
    await here.auth.signInWithPassword({ email, password });
    const r = await changePassword({ client: here, verifyClient: stateless(), email, current: password, next: password, confirm: password });
    expect(r).toMatchObject({ ok: false, reason: "same" });
  }, TIMEOUT);
});
