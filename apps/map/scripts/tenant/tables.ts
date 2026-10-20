// The tenant tables, in foreign-key order (docs/plans/38.md §2). This is the one place that knows
// what "an organisation's data" is. `where` selects exactly one org's rows, with $1 = the org id
// as text. admin_audit_log is deliberately absent: it is not tenant-scoped (plan §1).
export interface TenantTable {
  schema: string;
  table: string;
  where: string;
}

export const TENANT_TABLES: readonly TenantTable[] = [
  { schema: "public", table: "organizations", where: "id = $1::uuid" },
  { schema: "public", table: "colonies", where: "org_id = $1::uuid" },
  { schema: "public", table: "plots", where: "org_id = $1::uuid" },
  { schema: "public", table: "plot_history", where: "org_id = $1::uuid" },
  { schema: "auth", table: "users", where: "raw_app_meta_data ->> 'org_id' = $1::text" },
  {
    schema: "auth",
    table: "identities",
    where:
      "user_id in (select id from auth.users where raw_app_meta_data ->> 'org_id' = $1::text)",
  },
];

export const BACKDROP_BUCKET = "colony-backdrops";

// One-time tokens are never carried over (plan §3): a recovery or confirmation token pending on the
// source must not stay live on the target. They are exported as '' (not NULL or dropped): GoTrue
// fails to read a user row whose token columns are NULL.
export const BLANKED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  "auth.users": [
    "confirmation_token",
    "recovery_token",
    "email_change_token_new",
    "email_change_token_current",
    "phone_change_token",
    "reauthentication_token",
  ],
};

// auth.users changes on every login (last_sign_in_at), so its "did the source change" fingerprint
// covers only the columns an admin action would touch.
export const FINGERPRINT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  "auth.users": ["id", "email", "encrypted_password", "raw_app_meta_data"],
};

export function tableKey(t: TenantTable): string {
  return `${t.schema}.${t.table}`;
}

export function qualified(t: TenantTable): string {
  return `"${t.schema}"."${t.table}"`;
}
