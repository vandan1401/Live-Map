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

export async function insertOrganization(
  client: SupabaseClient,
  name: string,
): Promise<OrganizationRow> {
  const { data, error } = await client.from("organizations").insert({ name }).select().single();
  if (error) throw new Error(`insertOrganization failed: ${error.message}`);
  return data as OrganizationRow;
}
