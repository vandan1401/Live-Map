// Live-integration test helper (docs/plans/09.md) — creates real, disposable Supabase
// Auth accounts so tests can sign in and prove server-side attribution/RLS for real,
// the same "real local DB, not mocks" precedent as applyPlotTransition.test.ts's
// scratch-colony pattern. Not imported from any app code — test-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDbClient } from "../db/client.ts";
import { insertColony } from "../db/colonies.ts";
import { insertPlots } from "../db/plots.ts";
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

// docs/plans/21.md phase 1: one throwaway organization per call — no shared default org,
// since a hidden shared default between parallel test files is exactly the kind of
// cross-test collision this table exists to prevent. Not cleaned up by any counterpart
// deleteScratchOrg — see the comment on deleteScratchUser below for why that matches this
// repo's existing convention rather than fighting it.
export async function createScratchOrg(): Promise<string> {
  const admin = serviceRoleClient();
  const { data, error } = await admin
    .from("organizations")
    .insert({ name: `scratch-org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
    .select("id")
    .single();
  if (error) throw new Error(`createScratchOrg: insert failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function createScratchUser(displayName: string, orgId: string): Promise<ScratchUser> {
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
    // attribution path, not a looser one. org_id (docs/plans/21.md phase 1) is required,
    // no default — see createScratchOrg above.
    app_metadata: { display_name: displayName, org_id: orgId },
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

// Does not delete the user's scratch org (see createScratchOrg above) — this repo's tests
// already never clean up scratch colonies/plots either (they accumulate until
// `make db-reseed`, PROGRESS.md 2026-08-25/2026-08-30); matching that convention avoids a
// foreign-key-order cleanup problem (an org can't be deleted while a colony still
// references it) for no real benefit at this test volume. Do not "fix" this into an
// org-delete call — it would fail the moment a test's scratch colony outlives it.
export async function deleteScratchUser(user: ScratchUser): Promise<void> {
  await user.client.auth.signOut();
  const admin = serviceRoleClient();
  await admin.auth.admin.deleteUser(user.id);
}

// Shared by rls.test.ts and rls-cross-org.test.ts (docs/plans/21.md phase 1 split it out
// of rls.test.ts, which had grown past invariant 7's 250-line cap) — a disposable colony
// + one plot, service-role, bypassing RLS entirely. orgId is explicit, no default: a
// cross-org test needs two scratch plots in two deliberately different orgs.
export async function createScratchPlot(
  orgId: string,
): Promise<{ plotId: string; colonyId: string; svgId: string }> {
  const admin = serviceRoleClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const colonyId = `test-rls-${suffix}`;
  const svgId = `plot-A-${suffix.slice(0, 8)}`;
  await insertColony(admin, {
    id: colonyId,
    org_id: orgId,
    name: "RLS scratch colony",
    verified: false,
    svg: "<svg></svg>",
  });
  const [plot] = await insertPlots(admin, [
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
      status: "available",
      updated_by: "test-setup",
    },
  ]);
  return { plotId: plot.id, colonyId, svgId };
}
