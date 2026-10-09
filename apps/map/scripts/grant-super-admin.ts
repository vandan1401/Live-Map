// docs/plans/36.md: the ONLY way app_metadata.role = 'super_admin' is ever granted. No HTTP route
// of the admin portal can set or change a role. Run by the owner against one Supabase project:
//   pnpm grant-super-admin <username>
// The user must already exist (pnpm create-user). Other app_metadata keys are preserved.

import { createDbClient } from "../src/lib/db/client.ts";
import { usernameToEmail } from "../src/lib/auth/username.ts";

declare const process: NodeJS.Process & { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

function fail(message: string): never {
  console.error(`grant-super-admin: ${message}`);
  process.exit(1);
}

const [username] = process.argv.slice(2);
if (!username) fail("usage: pnpm grant-super-admin <username>");

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceRoleKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");

const client = createDbClient(url, serviceRoleKey);
const email = usernameToEmail(username);

let found: { id: string; app_metadata: Record<string, unknown> } | undefined;
for (let page = 1; !found; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail(`could not list users: ${error.message}`);
  found = data.users.find((user) => user.email === email);
  if (data.users.length < 200) break;
}
if (!found) fail(`no user "${username}" — create it first with pnpm create-user.`);

const { error } = await client.auth.admin.updateUserById(found.id, {
  app_metadata: { ...found.app_metadata, role: "super_admin" },
});
if (error) fail(`could not update the user: ${error.message}`);
console.log(`grant-super-admin: "${username}" is now a super admin.`);
