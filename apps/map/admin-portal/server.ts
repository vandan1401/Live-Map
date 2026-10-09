// docs/plans/23.md phase 3 + docs/plans/36.md: process entry point for the admin portal.
// Owner-run, never started by Claude (see .claude/hooks/guard.sh and CLAUDE.md's "Never run"
// list). Request handling lives in app.ts. Run via `pnpm admin-portal` / `make admin-portal`,
// or as the super-admin container in the self-hosted stack.
//
// Listens on ADMIN_HOST:ADMIN_PORT, default 127.0.0.1:5002 -- never 0.0.0.0 unless the
// operator sets it explicitly (the container does, and publishes the port on the Tailscale IP
// only). This file is the only place the service-role key enters the process.

import { createDbClient } from "../src/lib/db/client.ts";
import { createAdminServer } from "./app.ts";

declare const process: NodeJS.Process & { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

function main(): void {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !anonKey || !serviceRoleKey) {
    console.error(
      "admin-portal: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).",
    );
    process.exitCode = 1;
    return;
  }
  const host = process.env.ADMIN_HOST || "127.0.0.1";
  const port = Number(process.env.ADMIN_PORT || 5002);
  const client = createDbClient(url, serviceRoleKey);
  createAdminServer(client, { supabaseUrl: url, anonKey }).listen(port, host, () => {
    console.log(`admin portal listening on http://${host}:${port}`);
  });
}

main();
