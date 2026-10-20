import { qualified, type TenantTable } from "./tables.ts";

// Pure SQL builders. Rows travel as SQL-produced jsonb TEXT in both directions and are never parsed
// into JS numbers or Dates, so a bigint `*_paise` above 2^53 and a microsecond timestamp survive
// exactly (invariant 3, docs/plans/38.md §3).

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function columnList(columns: readonly string[]): string {
  return columns.map(quoteIdent).join(", ");
}

// One jsonb text per row, ordered by id for a deterministic file. Columns in `blank` are exported
// as '' (one-time tokens, see tables.ts).
export function buildSelectSql(
  t: TenantTable,
  columns: readonly string[],
  blank: readonly string[] = [],
): string {
  const select = columns
    .map((c) => (blank.includes(c) ? `''::text as ${quoteIdent(c)}` : quoteIdent(c)))
    .join(", ");
  return (
    `select to_jsonb(r)::text as j from (select ${select} from ${qualified(t)} ` +
    `where ${t.where} order by id) r`
  );
}

// md5 over every selected row, in id order: moves on any INSERT, UPDATE or DELETE of those columns,
// which a row count alone does not (a colony replace or a password change adds no rows).
export function buildFingerprintSql(t: TenantTable, columns: readonly string[]): string {
  return (
    `select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), '')) as h ` +
    `from (select ${columnList(columns)} from ${qualified(t)} where ${t.where}) r`
  );
}

// $1 is a JSON array (text) of row objects. Only the listed columns are inserted, so every
// unlisted column takes the target's own default instead of a NULL from the populate.
export function buildInsertSql(t: TenantTable, columns: readonly string[]): string {
  const cols = columnList(columns);
  return (
    `insert into ${qualified(t)} (${cols}) select ${cols} ` +
    `from jsonb_populate_recordset(null::${qualified(t)}, $1::jsonb)`
  );
}

export function buildCountSql(t: TenantTable): string {
  return `select count(*)::text as n from ${qualified(t)} where ${t.where}`;
}
