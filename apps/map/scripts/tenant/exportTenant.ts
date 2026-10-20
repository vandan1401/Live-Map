import path from "node:path";
import { compareCounts, formatCounts, readCounts, type Counts } from "./counts.ts";
import { connect, fetchColumns, type TenantEnv } from "./connect.ts";
import { TenantError } from "./errors.ts";
import { compareFingerprints, readFingerprints } from "./fingerprint.ts";
import { sha256Hex, writePrivate, type Manifest, type TableFile } from "./files.ts";
import { buildSelectSql } from "./sql.ts";
import { downloadObjects, type ObjectToCopy } from "./storage.ts";
import { BACKDROP_BUCKET, BLANKED_COLUMNS, TENANT_TABLES, tableKey } from "./tables.ts";

export interface ExportOptions {
  orgId: string;
  outDir: string;
  verifySource: boolean;
  log: (line: string) => void;
}

// Read-only export of one organisation (docs/plans/38.md §2). Every table is read in ONE
// REPEATABLE READ READ ONLY transaction so the files, counts and fingerprints describe the same
// instant. With --verify-source the source is re-read BEFORE manifest.json is written, so a source
// that moved leaves no manifest and the import refuses the folder.
export async function exportTenant(env: TenantEnv, opts: ExportOptions): Promise<Manifest> {
  const db = await connect(env);
  const tables: Record<string, TableFile> = {};
  const lines: Record<string, string[]> = {};
  let counts!: Counts;
  let fingerprints!: Record<string, string>;
  const objects: ObjectToCopy[] = [];
  try {
    await db.query("begin isolation level repeatable read read only");
    for (const t of TENANT_TABLES) {
      const key = tableKey(t);
      const columns = (await fetchColumns(db, t.schema, t.table))
        .filter((c) => !c.generated)
        .map((c) => c.name);
      if (columns.length === 0) throw new TenantError(`${key}: table not found on the source`);
      const res = await db.query(buildSelectSql(t, columns, BLANKED_COLUMNS[key] ?? []), [opts.orgId]);
      const rows = res.rows.map((r) => String(r.j));
      lines[key] = rows;
      tables[key] = {
        file: `${key}.ndjson`,
        rows: rows.length,
        sha256: "",
        columns,
        nonNullColumns: nonNullColumnsOf(rows),
      };
      opts.log(`read ${key}: ${rows.length} rows`);
    }
    if (tables["public.organizations"].rows !== 1) {
      throw new TenantError(`no organization with that id on the source (found ${tables["public.organizations"].rows})`);
    }
    counts = await readCounts(db, opts.orgId);
    fingerprints = await readFingerprints(db, opts.orgId, columnsOf(tables));
    objects.push(...(await backdropObjects(db, lines["public.colonies"])));
    await db.query("commit");
  } catch (e) {
    await db.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await db.end();
  }

  const storage = await downloadObjects(env, objects, opts.outDir);
  if (opts.verifySource) await verifySourceUnchanged(env, opts.orgId, counts, fingerprints, columnsOf(tables));

  for (const [key, rows] of Object.entries(lines)) {
    const body = rows.length === 0 ? "" : rows.join("\n") + "\n";
    tables[key].sha256 = sha256Hex(body);
    writePrivate(path.join(opts.outDir, tables[key].file), body);
  }
  const manifest: Manifest = {
    version: 1,
    orgId: opts.orgId,
    exportedAt: new Date().toISOString(),
    tables,
    counts,
    fingerprints,
    storage,
  };
  writePrivate(path.join(opts.outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  opts.log(`counts at export:\n${formatCounts(counts)}`);
  return manifest;
}

function columnsOf(tables: Record<string, TableFile>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(tables).map(([k, t]) => [k, t.columns]));
}

// A write on the source after the snapshot means the freeze (brief Part E.4, step 1) was not
// real; the export is then stale and must be redone, not imported. Compares row counts AND content
// fingerprints: an UPDATE (colony replace, backdrop edit, password change) adds no rows.
async function verifySourceUnchanged(
  env: TenantEnv,
  orgId: string,
  counts: Counts,
  fingerprints: Record<string, string>,
  columns: Record<string, string[]>,
): Promise<void> {
  const db = await connect(env);
  try {
    const problems = [
      ...compareCounts(counts, await readCounts(db, orgId)),
      ...compareFingerprints(fingerprints, await readFingerprints(db, orgId, columns)),
    ];
    if (problems.length > 0) {
      throw new TenantError(`the source changed after the snapshot, nothing was written:\n  ${problems.join("\n  ")}`);
    }
  } finally {
    await db.end();
  }
}

// Names of columns with at least one non-null value. JSON.parse is fine here: only null-ness is
// read, no value is kept (large integers lose precision in the parse but are never used).
function nonNullColumnsOf(rows: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const line of rows) {
    for (const [k, v] of Object.entries(JSON.parse(line) as Record<string, unknown>)) {
      if (v !== null) seen.add(k);
    }
  }
  return [...seen].sort();
}

async function backdropObjects(
  db: { query(sql: string, p?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
  colonyLines: readonly string[],
): Promise<ObjectToCopy[]> {
  const paths = colonyLines
    .map((l) => (JSON.parse(l) as { backdrop_storage_path: string | null }).backdrop_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length === 0) return [];
  const res = await db.query(
    `select name, metadata ->> 'mimetype' as mimetype, (metadata ->> 'size')::bigint::text as size
       from storage.objects where bucket_id = $1 and name = any($2::text[]) order by name`,
    [BACKDROP_BUCKET, paths],
  );
  const found = new Map(res.rows.map((r) => [String(r.name), r]));
  const missing = paths.filter((p) => !found.has(p));
  if (missing.length > 0) {
    throw new TenantError(`${missing.length} backdrop path(s) in colonies have no storage object: ${missing.join(", ")}`);
  }
  return paths.map((p) => {
    const r = found.get(p) as Record<string, unknown>;
    return {
      bucket: BACKDROP_BUCKET,
      path: p,
      contentType: String(r.mimetype ?? "application/octet-stream"),
      bytes: Number(r.size),
    };
  });
}
