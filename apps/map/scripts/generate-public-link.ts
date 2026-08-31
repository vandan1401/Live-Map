// This phase's entire admin surface for the public colony link (docs/plans/22.md phase 2)
// — a CLI arg, same "a CLI arg and hand-run SQL, nothing more" posture docs/plans/21.md
// established for phase 1. Regenerating overwrites the colony's token, invalidating any
// previously shared link (not idempotent, by design). Revocation is hand-run SQL, not a
// second script: `update colonies set public_token = null where id = '<id>';`.
// Run via `pnpm generate-public-link <colony_id>`.

import { randomUUID } from "node:crypto";
import { createDbClient } from "../src/lib/db/client.ts";
import { fetchColonyById } from "../src/lib/db/colonies.ts";

declare const process: NodeJS.Process & { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

// process.exitCode, not process.exit() — this script's failure paths run after a real
// fetch (unlike create-user.ts's synchronous top-level "usage" check), and a forced
// process.exit() while an undici keep-alive socket is still open crashes with a libuv
// assertion on Windows (confirmed while building this script). Setting exitCode and
// returning lets Node drain the event loop and exit cleanly with the same nonzero code.
function fail(message: string): void {
  console.error(`generate-public-link: ${message}`);
  process.exitCode = 1;
}

const [colonyId] = process.argv.slice(2);
const url = process.env.VITE_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function main() {
  if (!colonyId) {
    fail("usage: pnpm generate-public-link <colony_id>");
    return;
  }
  if (!url || !serviceRoleKey) {
    fail("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");
    return;
  }

  const client = createDbClient(url, serviceRoleKey);

  const existing = await fetchColonyById(client, colonyId);
  if (!existing) {
    fail(`no colony with id "${colonyId}".`);
    return;
  }

  const token = randomUUID();
  const { error } = await client.from("colonies").update({ public_token: token }).eq("id", colonyId);
  if (error) {
    fail(`could not update colony: ${error.message}`);
    return;
  }

  console.log(`public link generated for colony "${colonyId}":`);
  console.log(`  token: ${token}`);
  console.log(`  path:  #/public/${token}  (prepend your deployed app's own domain)`);
}

void main();
