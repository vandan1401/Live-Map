// docs/plans/23.md phase 3: the admin portal's own domain layer — plain functions taking a
// service-role SupabaseClient, returning typed data or throwing. Lives outside src/ on
// purpose (this tool is never part of the shipped Vite bundle, see server.ts's own
// comment). User-management calls go straight through client.auth.admin.* (the same
// precedent scripts/create-user.ts and lib/auth/testHelpers.ts's createScratchUser already
// established — the "supabase.from() only in lib/db" rule (tier-2.md) governs table
// queries, not the Admin API); organization/colony table reads reuse lib/db as normal.
import type { SupabaseClient } from "@supabase/supabase-js";
import { InvalidUsernameError, usernameToEmail } from "../src/lib/auth/username.ts";

const LIST_USERS_PAGE_SIZE = 200;

export interface OrgUser {
  id: string;
  email: string;
  displayName: string | null;
}

// Loops pages until one comes back short of a full page — at this project's real scale
// (PROGRESS.md 2026-08-27: <=20 orgs, 5-10 users each) this is one call in practice; the
// loop exists so a larger deployment later doesn't silently truncate the list.
export async function listOrgUsers(client: SupabaseClient, orgId: string): Promise<OrgUser[]> {
  const matches: OrgUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE_SIZE });
    if (error) throw new Error(`listOrgUsers failed: ${error.message}`);
    for (const user of data.users) {
      if (user.app_metadata?.org_id === orgId) {
        matches.push({
          id: user.id,
          email: user.email ?? "",
          displayName: (user.app_metadata?.display_name as string | undefined) ?? null,
        });
      }
    }
    if (data.users.length < LIST_USERS_PAGE_SIZE) break;
  }
  return matches;
}

export interface CreateOrgUserArgs {
  username: string;
  password: string;
  displayName: string;
  orgId: string;
}

// Same app_metadata shape as scripts/create-user.ts's own call — display_name/org_id,
// never user_metadata (D-020: app_metadata is service-role-write-only, which is what makes
// server-side attribution unforgeable). InvalidUsernameError propagates to the caller
// (server.ts maps it to a 400) rather than being swallowed here.
export async function createOrgUser(
  client: SupabaseClient,
  args: CreateOrgUserArgs,
): Promise<{ id: string }> {
  const email = usernameToEmail(args.username); // throws InvalidUsernameError on a bad username
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: args.password,
    email_confirm: true,
    app_metadata: { display_name: args.displayName, org_id: args.orgId },
  });
  if (error) throw new Error(`createOrgUser failed: ${error.message}`);
  return { id: data.user.id };
}

// Fetch-then-merge, not a bare `{ app_metadata: { org_id: newOrgId } }`. Verified directly
// against the local Supabase instance (docs/plans/23.md build session) that GoTrue's Admin
// API actually merges app_metadata server-side on its own — a bare overwrite does NOT drop
// display_name, contrary to this plan's original assumption (drawn by analogy to the
// phase-1 migration's raw-SQL `||` /review finding, which does not apply here: that was a
// hand-written SQL `update`, this is the Admin API's own update path). Kept anyway as
// defense in depth — this behavior is real but undocumented, and a client-side merge stays
// correct even if it ever changes.
export async function reassignUserOrg(
  client: SupabaseClient,
  userId: string,
  newOrgId: string,
): Promise<void> {
  const { data: current, error: fetchError } = await client.auth.admin.getUserById(userId);
  if (fetchError) throw new Error(`reassignUserOrg failed to fetch user: ${fetchError.message}`);

  const merged = { ...current.user.app_metadata, org_id: newOrgId };
  const { error: updateError } = await client.auth.admin.updateUserById(userId, {
    app_metadata: merged,
  });
  if (updateError) throw new Error(`reassignUserOrg failed to update user: ${updateError.message}`);
}

export { InvalidUsernameError };
