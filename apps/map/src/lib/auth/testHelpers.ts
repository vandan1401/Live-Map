// Live-integration test helper (docs/plans/09.md) — creates real, disposable Supabase
// Auth accounts so tests can sign in and prove server-side attribution/RLS for real,
// the same "real local DB, not mocks" precedent as applyPlotTransition.test.ts's
// scratch-colony pattern. Not imported from any app code — test-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDbClient } from "../db/client.ts";
import { usernameToEmail } from "./username.ts";

// Distinct from getBrowserDbClient(): persistSession: false so this client never reads
// or writes the shared localStorage session GoTrue keys off the project URL — two
// clients built from the same URL otherwise share one session, which would silently
// un-anonymise an "anon" test client left over from an earlier signed-in scratch user in
// the same test file. Use this whenever a test needs to prove anon-role behaviour.
export function createStatelessAnonClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? "";
  return createDbClient(url, anonKey, { auth: { persistSession: false } });
}

// src/ is built under tsconfig.app.json, which has no Node types (browser-only, by
// design — see docs/plans/09.md's "never reach import.meta.env" constraint). A minimal
// structural declaration is enough here; no need to pull in @types/node globally.
declare const process: { env: Record<string, string | undefined> };

export interface ScratchUser {
  id: string;
  displayName: string;
  // Already signed in — the same anon-key client shape the real app uses, so tests
  // exercise the exact RLS/RPC path a real user would.
  client: SupabaseClient;
}

// Exported for setup-only calls (creating scratch colonies/plots) that also need to
// bypass RLS — the same key scripts/import-seed.ts uses.
export function serviceRoleClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for live-integration tests (see .env.example).",
    );
  }
  return createDbClient(url, serviceRoleKey);
}

export async function createScratchUser(displayName: string): Promise<ScratchUser> {
  const admin = serviceRoleClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const username = `test-${suffix}`;
  const password = `pw-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
  const email = usernameToEmail(username);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // app_metadata, NOT user_metadata (docs/plans/09.md /review finding) — matches
    // scripts/create-user.ts exactly, since these tests must exercise the real
    // attribution path, not a looser one.
    app_metadata: { display_name: displayName },
  });
  if (error) throw new Error(`createScratchUser: createUser failed: ${error.message}`);

  // A unique storageKey per scratch user, not getBrowserDbClient()'s shared default —
  // GoTrue's default key is derived from the URL alone, so two default-key clients in
  // the same test file silently share (and cross-tab-broadcast-sync) one session; two
  // scratch users signing in back to back would otherwise both end up authenticated as
  // whichever signed in last. Each scratch user needs a genuinely independent session.
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const client = createDbClient(url, anonKey, {
    auth: { storageKey: `sb-test-${suffix}-auth-token` },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`createScratchUser: sign-in failed: ${signInError.message}`);
  }

  return { id: data.user.id, displayName, client };
}

export async function deleteScratchUser(user: ScratchUser): Promise<void> {
  await user.client.auth.signOut();
  const admin = serviceRoleClient();
  await admin.auth.admin.deleteUser(user.id);
}
