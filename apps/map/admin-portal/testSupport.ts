// Test-only helpers for the admin portal's live-integration tests (docs/plans/36.md): real
// scratch users against the local Docker Supabase, and the real request handler on a real
// loopback socket. Not imported by any shipped code.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../src/lib/auth/username.ts";
import { createAdminServer } from "./app.ts";
import { serviceRoleClient } from "../src/lib/auth/testHelpers.ts";

declare const process: { env: Record<string, string | undefined> };

export interface TestUser {
  id: string;
  username: string;
  password: string;
}

export async function makeUser(opts: { superAdmin?: boolean; orgId?: string; displayName?: string } = {}): Promise<TestUser> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const username = `t-${suffix}`;
  const password = `pw-${suffix}-ok`;
  const appMetadata: Record<string, unknown> = { display_name: opts.displayName ?? `Test ${suffix}` };
  if (opts.orgId) appMetadata.org_id = opts.orgId;
  if (opts.superAdmin) appMetadata.role = "super_admin";
  const { data, error } = await serviceRoleClient().auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error) throw new Error(`makeUser failed: ${error.message}`);
  return { id: data.user.id, username, password };
}

export interface RunningServer {
  base: string;
  client: SupabaseClient;
  close: () => Promise<void>;
}

export async function startServer(): Promise<RunningServer> {
  const client = serviceRoleClient();
  const server: Server = createAdminServer(client, {
    supabaseUrl: process.env.VITE_SUPABASE_URL ?? "",
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? "",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    client,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function call(
  base: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

export async function loginToken(base: string, user: TestUser): Promise<string> {
  const { status, json } = await call(base, "POST", "/api/login", { body: { username: user.username, password: user.password } });
  if (status !== 200) throw new Error(`loginToken: expected 200, got ${status}: ${JSON.stringify(json)}`);
  return json.accessToken as string;
}

// True if the username/password pair can sign in right now (a fresh stateless anon client).
export async function signInWithPasswordOk(username: string, password: string): Promise<boolean> {
  const { createStatelessAnonClient } = await import("../src/lib/auth/testHelpers.ts");
  const { error } = await createStatelessAnonClient().auth.signInWithPassword({ email: usernameToEmail(username), password });
  return !error;
}
