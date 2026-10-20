// All-or-nothing import of a tenant export (docs/plans/38.md, brief Part E).
//   pnpm tenant:import --in <folder> --target-env .env.tenant-target [--dry-run]
// --dry-run does everything, including the count comparison, then rolls back. The target's
// database port is not published on the box: reach it through an SSH tunnel to the db container's
// bridge address (see deploy/selfhost/TENANT-TRANSFER.md) and put the tunnel address in the env file.
import { parseArgs, requireValue } from "./tenant/args.ts";
import { loadTenantEnv } from "./tenant/connect.ts";
import { describeError } from "./tenant/errors.ts";
import { importTenant } from "./tenant/importTenant.ts";

declare const process: NodeJS.Process;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), ["in", "target-env"], ["dry-run"]);
  const env = loadTenantEnv(requireValue(args, "target-env"));
  await importTenant(env, {
    inDir: requireValue(args, "in"),
    dryRun: args.flags.has("dry-run"),
    log: (line) => console.log(line),
  });
}

main().catch((e: unknown) => {
  console.error(`tenant-import: ${describeError(e)}`);
  process.exit(1);
});
