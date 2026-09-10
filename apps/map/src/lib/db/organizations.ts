import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationRow } from "./types.ts";

// docs/plans/23.md phase 3: the admin portal's read/create surface. Reads go through
// `.select()` (RLS allows `authenticated`/`anon` select, filtered — see
// docs/plans/21.md task A1), but this file's own callers always use a service-role client,
// same as every other admin-only path in this app.
export async function fetchOrganizations(client: SupabaseClient): Promise<OrganizationRow[]> {
  const { data, error } = await client.from("organizations").select("*").order("name");
  if (error) throw new Error(`fetchOrganizations failed: ${error.message}`);
  return (data as OrganizationRow[] | null) ?? [];
}

// The signed-in app's own read (not the admin portal's) — RLS's
// "organizations_authenticated_select" policy (20260831000000_m16_organizations.sql)
// already scopes this to the caller's own org, so a plain select-all returns at most one
// row. Used to show a group's real name on its own home screen instead of the single
// checked-in default in presentation.json (owner ask: rename per group via the admin
// portal, not a shared config value — see docs/plans/27.md's now-superseded
// per-org-heading non-goal).
export async function fetchMyOrganization(client: SupabaseClient): Promise<OrganizationRow | null> {
  const { data, error } = await client.from("organizations").select("*").maybeSingle();
  if (error) throw new Error(`fetchMyOrganization failed: ${error.message}`);
  return (data as OrganizationRow | null) ?? null;
}

export async function insertOrganization(
  client: SupabaseClient,
  name: string,
): Promise<OrganizationRow> {
  const { data, error } = await client.from("organizations").insert({ name }).select().single();
  if (error) throw new Error(`insertOrganization failed: ${error.message}`);
  return data as OrganizationRow;
}
