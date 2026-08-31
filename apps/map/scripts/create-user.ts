// Admin-only account creation (docs/plans/09.md, D-019) — the *only* way an account
// comes to exist, since supabase/config.toml sets enable_signup = false. An
// admin-created auth.users row is the allowlist; there is no separate roster table.
// Run via `pnpm create-user <username> <password> "<Display Name>" <org_id>`.
// org_id (docs/plans/21.md phase 1) is the target organization's uuid — required, no
// default; find it via `select id, name from organizations` against the target project.

import { createDbClient } from "../src/lib/db/client.ts";
import { usernameToEmail } from "../src/lib/auth/username.ts";

declare const process: NodeJS.Process & { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

function fail(message: string): never {
  console.error(`create-user: ${message}`);
  process.exit(1);
}

const [username, password, displayName, orgId] = process.argv.slice(2);
if (!username || !password || !displayName || !orgId) {
  fail('usage: pnpm create-user <username> <password> "<Display Name>" <org_id>');
}

const url = process.env.VITE_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceRoleKey) {
  fail("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");
}

async function main() {
  const email = usernameToEmail(username);
  const client = createDbClient(url, serviceRoleKey);

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // app_metadata, NOT user_metadata (docs/plans/09.md /review finding) —
    // user_metadata is writable by the signed-in user themselves via PUT
    // /auth/v1/user; app_metadata is service-role-only to write, which is what makes
    // apply_plot_transition()'s server-side attribution (D-020) actually unforgeable.
    // org_id (docs/plans/21.md phase 1) is read the same way, by every org-scoped RLS
    // policy and security-definer RPC — same unforgeability, same reason.
    app_metadata: { display_name: displayName, org_id: orgId },
  });

  if (error) fail(`could not create account: ${error.message}`);
  console.log(
    `created account "${username}" (${data.user.id}), display name "${displayName}", org ${orgId}.`,
  );
}

void main();
