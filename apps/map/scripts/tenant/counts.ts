import { buildCountSql } from "./sql.ts";
import { TENANT_TABLES, tableKey } from "./tables.ts";

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface Counts {
  tables: Record<string, number>;
  perColony: Record<string, { plots: number; history: number }>;
}

// Counts only, never contents (brief Part E.3). Read inside whatever transaction the caller holds,
// so the export's counts belong to its snapshot and the import's to its own uncommitted rows.
export async function readCounts(db: Queryable, orgId: string): Promise<Counts> {
  const tables: Record<string, number> = {};
  for (const t of TENANT_TABLES) {
    const res = await db.query(buildCountSql(t), [orgId]);
    tables[tableKey(t)] = Number(res.rows[0].n);
  }
  const res = await db.query(
    `select c.id as colony_id,
            (select count(*) from public.plots p where p.colony_id = c.id)::text as plots,
            (select count(*) from public.plot_history h
               join public.plots p on p.id = h.plot_id where p.colony_id = c.id)::text as history
       from public.colonies c where c.org_id = $1::uuid order by c.id`,
    [orgId],
  );
  const perColony: Counts["perColony"] = {};
  for (const r of res.rows) {
    perColony[String(r.colony_id)] = { plots: Number(r.plots), history: Number(r.history) };
  }
  return { tables, perColony };
}

// Empty list = identical. Each entry names a table or colony and both numbers, nothing else.
export function compareCounts(expected: Counts, actual: Counts): string[] {
  const problems: string[] = [];
  for (const key of new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)])) {
    const a = expected.tables[key] ?? 0;
    const b = actual.tables[key] ?? 0;
    if (a !== b) problems.push(`${key}: expected ${a}, got ${b}`);
  }
  const colonies = new Set([...Object.keys(expected.perColony), ...Object.keys(actual.perColony)]);
  for (const id of colonies) {
    const a = expected.perColony[id] ?? { plots: 0, history: 0 };
    const b = actual.perColony[id] ?? { plots: 0, history: 0 };
    if (a.plots !== b.plots) problems.push(`colony ${id} plots: expected ${a.plots}, got ${b.plots}`);
    if (a.history !== b.history) {
      problems.push(`colony ${id} history: expected ${a.history}, got ${b.history}`);
    }
  }
  return problems;
}

export function formatCounts(counts: Counts): string {
  const lines = Object.entries(counts.tables).map(([k, n]) => `  ${k.padEnd(24)} ${n}`);
  for (const [id, c] of Object.entries(counts.perColony)) {
    lines.push(`  colony ${id}: ${c.plots} plots, ${c.history} history rows`);
  }
  return lines.join("\n");
}
