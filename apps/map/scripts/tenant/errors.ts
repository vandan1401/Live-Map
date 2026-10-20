// One error type for every refusal in the tenant export/import (docs/plans/38.md). The entry
// scripts print `message` and exit non-zero; nothing in here ever puts a connection string, key
// or row content into a message, only table names, counts and column names.
export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

// What the entry scripts print for any thrown value. A database error is reduced to its SQLSTATE
// code and the table / column / constraint it names: never `message` or `detail`, which can quote
// the offending row's values (personal data, password hashes).
export function describeError(e: unknown): string {
  if (e instanceof TenantError) return e.message;
  const pgErr = e as { code?: unknown; table?: unknown; column?: unknown; constraint?: unknown };
  if (typeof pgErr?.code === "string") {
    const parts = [`code ${pgErr.code}`];
    for (const k of ["table", "column", "constraint"] as const) {
      if (typeof pgErr[k] === "string") parts.push(`${k} ${pgErr[k]}`);
    }
    return `database error (${parts.join(", ")})`;
  }
  return `unexpected error (${e instanceof Error ? e.name : typeof e})`;
}
