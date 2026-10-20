import path from "node:path";
import type pg from "pg";
import { planColumns } from "./columns.ts";
import { compareCounts, formatCounts, readCounts } from "./counts.ts";
import { connect, fetchColumns, type TenantEnv } from "./connect.ts";
import { TenantError } from "./errors.ts";
import { loadManifest, readLines, verifyHashes, type Manifest, type StorageEntry } from "./files.ts";
import { checkExportIntegrity, type LoadedExport, type Row } from "./preflight.ts";
import { buildCountSql, buildInsertSql } from "./sql.ts";
import { removeUploaded, uploadAndVerify } from "./storage.ts";
import { TENANT_TABLES, tableKey } from "./tables.ts";

export interface ImportOptions {
  inDir: string;
  dryRun: boolean;
  log: (line: string) => void;
}

const CHUNK = 500;

// All-or-nothing import of one export into a target that has none of that org's data
// (docs/plans/38.md §2, §3, §6). plot_history rejects UPDATE and DELETE, so a half-written import
// can never be cleaned up row by row; therefore: one transaction, COMMIT is the very last step.
export async function importTenant(env: TenantEnv, opts: ImportOptions): Promise<void> {
  const manifest = loadManifest(opts.inDir);
  verifyHashes(opts.inDir, manifest);
  const lines: Record<string, string[]> = {};
  const loaded: LoadedExport = { orgId: manifest.orgId, rows: {} };
  for (const t of TENANT_TABLES) {
    const key = tableKey(t);
    const meta = manifest.tables[key];
    if (!meta) throw new TenantError(`manifest has no entry for ${key}`);
    lines[key] = readLines(path.join(opts.inDir, meta.file));
    if (lines[key].length !== meta.rows) throw new TenantError(`${key}: row count differs from the manifest`);
    loaded.rows[key] = lines[key].map((l) => JSON.parse(l) as Row);
  }
  const problems = checkExportIntegrity(loaded);
  if (problems.length > 0) throw new TenantError(`export failed its integrity checks:\n  ${problems.join("\n  ")}`);

  const db = await connect(env);
  const created: StorageEntry[] = [];
  try {
    await db.query("begin");
    await assertTargetEmpty(db, manifest, loaded);
    // Column compatibility for every table is decided before the first row is written (plan §2).
    const plans: Record<string, string[]> = {};
    for (const t of TENANT_TABLES) {
      const key = tableKey(t);
      const meta = manifest.tables[key];
      plans[key] = planColumns(key, meta.columns, new Set(meta.nonNullColumns), await fetchColumns(db, t.schema, t.table));
    }
    for (const t of TENANT_TABLES) {
      const key = tableKey(t);
      const columns = plans[key];
      for (let i = 0; i < lines[key].length; i += CHUNK) {
        const json = "[" + lines[key].slice(i, i + CHUNK).join(",") + "]";
        await db.query(buildInsertSql(t, columns), [json]);
      }
      opts.log(`inserted ${key}: ${lines[key].length} rows`);
    }
    const after = await readCounts(db, manifest.orgId);
    const diff = compareCounts(manifest.counts, after);
    if (diff.length > 0) throw new TenantError(`counts differ after insert, rolled back:\n  ${diff.join("\n  ")}`);
    opts.log(`counts on the target:\n${formatCounts(after)}`);

    if (opts.dryRun) {
      opts.log(`dry run: ${manifest.storage.length} storage object(s) checked by hash only, nothing uploaded`);
      await db.query("rollback");
      opts.log("dry run: rolled back, the target is unchanged");
      return;
    }
    await uploadAndVerify(env, manifest.storage, opts.inDir, created);
    await db.query("commit");
    opts.log("committed");
  } catch (e) {
    await db.query("rollback").catch(() => undefined);
    if (created.length > 0) {
      const left = await removeUploaded(env, created).catch(() => created.map((c) => c.path));
      if (left.length > 0) opts.log(`WARNING: could not remove uploaded object(s), delete by hand: ${left.join(", ")}`);
    }
    throw e;
  } finally {
    await db.end();
  }
}

// Refuses (naming the table) unless the target holds none of this org's rows and none of its
// users. No merge, no upsert: a second run must fail here, never append to plot_history.
async function assertTargetEmpty(db: pg.Client, m: Manifest, loaded: LoadedExport): Promise<void> {
  const notEmpty: string[] = [];
  for (const t of TENANT_TABLES) {
    const n = Number((await db.query(buildCountSql(t), [m.orgId])).rows[0].n);
    if (n > 0) notEmpty.push(`${tableKey(t)} (${n} rows)`);
  }
  const ids = loaded.rows["auth.users"].map((u) => String(u.id));
  const emails = loaded.rows["auth.users"].map((u) => String(u.email));
  const clash = await db.query(
    "select count(*)::text as n from auth.users where id = any($1::uuid[]) or email = any($2::text[])",
    [ids, emails],
  );
  if (Number(clash.rows[0].n) > 0) notEmpty.push(`auth.users (${clash.rows[0].n} matching id or email)`);
  // colonies.id and colonies.public_token are unique across ALL orgs: another org on the target
  // (e.g. a reseeded fixture colony) can hold the same key even though this org has no rows.
  const colonies = loaded.rows["public.colonies"];
  const tokens = colonies.map((c) => c.public_token).filter((x): x is string => typeof x === "string");
  const taken = await db.query(
    "select count(*)::text as n from public.colonies where id = any($1::text[]) or public_token = any($2::uuid[])",
    [colonies.map((c) => String(c.id)), tokens],
  );
  if (Number(taken.rows[0].n) > 0) {
    notEmpty.push(`public.colonies (${taken.rows[0].n} colony id or public_token already used by another org)`);
  }
  if (notEmpty.length > 0) {
    throw new TenantError(`the target already holds data for this org, refusing: ${notEmpty.join("; ")}`);
  }
}
