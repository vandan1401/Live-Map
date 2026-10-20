import { TenantError } from "./errors.ts";

export interface ColumnInfo {
  name: string;
  generated: boolean;
  notNull: boolean;
  hasDefault: boolean;
}

// Column compatibility between the source export and the target table (docs/plans/38.md §3).
// The cloud project's migrations were hand-applied, so its schema may lag or lead the box's;
// compatibility is judged from the columns themselves, never from migration bookkeeping.
//
//   copy = exported columns that also exist, non-generated, on the target
//   refuse if a dropped (source-only) column holds a non-null value somewhere: that data would
//          silently vanish
//   refuse if the target has a NOT NULL, no-default column the export does not carry
export function planColumns(
  table: string,
  exported: readonly string[],
  nonNullInExport: ReadonlySet<string>,
  target: readonly ColumnInfo[],
): string[] {
  const insertable = new Map(target.filter((c) => !c.generated).map((c) => [c.name, c]));
  const copy = exported.filter((name) => insertable.has(name));
  const dropped = exported.filter((name) => !insertable.has(name));

  const losing = dropped.filter((name) => nonNullInExport.has(name));
  if (losing.length > 0) {
    throw new TenantError(
      `${table}: the target has no column for exported data in: ${losing.join(", ")}`,
    );
  }

  const copied = new Set(copy);
  const missing = [...insertable.values()]
    .filter((c) => c.notNull && !c.hasDefault && !copied.has(c.name))
    .map((c) => c.name);
  if (missing.length > 0) {
    throw new TenantError(
      `${table}: the target requires column(s) the export does not carry: ${missing.join(", ")}`,
    );
  }
  return copy;
}
