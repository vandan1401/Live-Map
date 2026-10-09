// docs/plans/23.md phase 3: the admin portal's own domain layer — plain functions taking a
// service-role SupabaseClient, returning typed data or throwing. Lives outside src/ on
// purpose (this tool is never part of the shipped Vite bundle, see server.ts's own
// comment). User-management calls go straight through client.auth.admin.* (the same
// precedent scripts/create-user.ts and lib/auth/testHelpers.ts's createScratchUser already
// established — the "supabase.from() only in lib/db" rule (tier-2.md) governs table
// queries, not the Admin API); organization/colony table reads reuse lib/db as normal.
import type { SupabaseClient } from "@supabase/supabase-js";
import { InvalidUsernameError, usernameToEmail } from "../src/lib/auth/username.ts";
import { HttpError } from "./httpHelpers.ts";
import { isSuperAdminUser } from "./auth.ts";

// docs/plans/36.md: pinned at 8, enforced server-side for create AND reset.
export const MIN_PASSWORD_LENGTH = 8;
const BAN_FOREVER = "876000h"; // ~100 years; reversible with "none"

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

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
  validatePassword(args.password);
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

export interface AdminUser extends OrgUser {
  orgId: string | null;
  isSuperAdmin: boolean;
  deactivated: boolean;
}

export async function listAllUsers(client: SupabaseClient): Promise<AdminUser[]> {
  const users: AdminUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE_SIZE });
    if (error) throw new Error(`listAllUsers failed: ${error.message}`);
    for (const user of data.users) {
      const bannedUntil = (user as { banned_until?: string | null }).banned_until;
      users.push({
        id: user.id,
        email: user.email ?? "",
        displayName: (user.app_metadata?.display_name as string | undefined) ?? null,
        orgId: (user.app_metadata?.org_id as string | undefined) ?? null,
        isSuperAdmin: isSuperAdminUser(user),
        deactivated: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
      });
    }
    if (data.users.length < LIST_USERS_PAGE_SIZE) break;
  }
  return users;
}

// The guard every user-changing action passes through: the target must exist, must not be
// another super admin, and (unless allowSelf) must not be the caller.
export async function loadManageableUser(
  client: SupabaseClient,
  actorId: string,
  targetId: string,
  allowSelf: boolean,
): Promise<{ id: string; email: string }> {
  const { data, error } = await client.auth.admin.getUserById(targetId);
  if (error || !data.user) throw new HttpError(404, "No such user.");
  const user = data.user;
  if (isSuperAdminUser(user) && user.id !== actorId) {
    throw new HttpError(403, "Super-admin accounts cannot be changed from the portal.");
  }
  if (!allowSelf && user.id === actorId) {
    throw new HttpError(403, "You cannot do this to your own account.");
  }
  return { id: user.id, email: user.email ?? "" };
}

export async function resetUserPassword(client: SupabaseClient, userId: string, password: string): Promise<void> {
  const { error } = await client.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(`resetUserPassword failed: ${error.message}`);
}

export async function setUserActive(client: SupabaseClient, userId: string, active: boolean): Promise<void> {
  const { error } = await client.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BAN_FOREVER });
  if (error) throw new Error(`setUserActive failed: ${error.message}`);
}

export async function deleteUser(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}

export { InvalidUsernameError };
