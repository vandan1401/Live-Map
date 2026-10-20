import type { Queryable } from "./counts.ts";
import { buildFingerprintSql } from "./sql.ts";
import { BLANKED_COLUMNS, FINGERPRINT_COLUMNS, TENANT_TABLES, tableKey } from "./tables.ts";

// Content fingerprints per table, used by `--verify-source` to prove the source did not move
// between the snapshot and the end of the export (docs/plans/38.md §6, concurrency). Hashes only:
// nothing here can leak a row.
export async function readFingerprints(
  db: Queryable,
  orgId: string,
  columnsByTable: Readonly<Record<string, readonly string[]>>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of TENANT_TABLES) {
    const key = tableKey(t);
    const exported = columnsByTable[key] ?? [];
    const only = FINGERPRINT_COLUMNS[key];
    const blanked = BLANKED_COLUMNS[key] ?? [];
    const columns = exported.filter(
      (c) => !blanked.includes(c) && (only === undefined || only.includes(c)),
    );
    const res = await db.query(buildFingerprintSql(t, columns), [orgId]);
    out[key] = String(res.rows[0].h);
  }
  return out;
}

export function compareFingerprints(
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(expected)
    .filter((key) => expected[key] !== actual[key])
    .map((key) => `${key}: content changed since the snapshot`);
}
