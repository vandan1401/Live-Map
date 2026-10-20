// Read-only export of one organisation (docs/plans/38.md, brief Part E).
//   pnpm tenant:export --org <uuid> --source-env .env.tenant-source --out <folder> [--verify-source]
// The output holds personal data and password hashes: it must be outside the repository, and it
// should be deleted once the cutover is signed off. Nothing here writes to the source database.
import { parseArgs, requireUuid, requireValue } from "./tenant/args.ts";
import { loadTenantEnv } from "./tenant/connect.ts";
import { describeError } from "./tenant/errors.ts";
import { exportTenant } from "./tenant/exportTenant.ts";
import { assertOutDirSafe } from "./tenant/files.ts";

declare const process: NodeJS.Process;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), ["org", "source-env", "out"], ["verify-source"]);
  const orgId = requireUuid(requireValue(args, "org"), "--org");
  const outDir = assertOutDirSafe(requireValue(args, "out"));
  const env = loadTenantEnv(requireValue(args, "source-env"));
  const manifest = await exportTenant(env, {
    orgId,
    outDir,
    verifySource: args.flags.has("verify-source"),
    log: (line) => console.log(line),
  });
  console.log(`export written to ${outDir} (${Object.keys(manifest.tables).length} tables, ${manifest.storage.length} storage objects)`);
  console.log("This folder holds personal data and password hashes: delete it after the cutover.");
}

main().catch((e: unknown) => {
  console.error(`tenant-export: ${describeError(e)}`);
  process.exit(1);
});
