import fs from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";
import { TenantError } from "./errors.ts";
import type { ColumnInfo } from "./columns.ts";
import type { Queryable } from "./counts.ts";

export interface TenantEnv {
  databaseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  // Path to a PEM CA certificate; required when the database host is not loopback.
  databaseCaFile?: string;
}

// Reads one of the git-ignored .env.tenant-* files. Errors name MISSING KEYS only: no value, and
// above all not DATABASE_URL (it holds the database password), is ever printed or logged.
export function loadTenantEnv(file: string): TenantEnv {
  if (!fs.existsSync(file)) throw new TenantError(`env file not found: ${file}`);
  const parsed = parseEnv(fs.readFileSync(file, "utf8"));
  const databaseUrl = parsed.DATABASE_URL;
  const supabaseUrl = parsed.VITE_SUPABASE_URL;
  const serviceRoleKey = parsed.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    const missing = [
      ["DATABASE_URL", databaseUrl],
      ["VITE_SUPABASE_URL", supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    throw new TenantError(`${file} has no value for: ${missing.join(", ")}`);
  }
  return { databaseUrl, supabaseUrl, serviceRoleKey, databaseCaFile: parsed.DATABASE_CA_FILE };
}

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

// Loopback (local stack, SSH tunnel) is plain. Any other host is TLS with the certificate chain
// VERIFIED against the CA file named by DATABASE_CA_FILE (Supabase publishes its CA certificate in
// the dashboard under Project Settings -> Database -> SSL). The database password and every
// password hash cross this connection, so an unverified channel is refused, not tolerated.
export async function connect(env: TenantEnv): Promise<pg.Client> {
  const host = new URL(env.databaseUrl).hostname;
  let ssl: pg.ClientConfig["ssl"] = false;
  if (!isLoopback(host)) {
    if (!env.databaseCaFile || !fs.existsSync(env.databaseCaFile)) {
      throw new TenantError(
        "a remote database needs DATABASE_CA_FILE in the env file: the path of the CA certificate (PEM) your provider publishes",
      );
    }
    ssl = { ca: fs.readFileSync(env.databaseCaFile, "utf8"), rejectUnauthorized: true };
  }
  const client = new pg.Client({ connectionString: env.databaseUrl, ssl });
  // An idle connection can drop (SSH tunnel, network) while Storage uploads run; without a listener
  // that would crash the process before the rollback and cleanup in the caller's catch.
  client.on("error", () => undefined);
  try {
    await client.connect();
  } catch (e) {
    // pg's message can echo connection details; report only the error code.
    const code = (e as { code?: string }).code ?? "unknown";
    throw new TenantError(`could not connect to the database (${code}) as ${host}`);
  }
  return client;
}

export async function fetchColumns(
  db: Queryable,
  schema: string,
  table: string,
): Promise<ColumnInfo[]> {
  const res = await db.query(
    `select column_name, is_nullable, column_default, is_generated, is_identity, identity_generation
       from information_schema.columns
      where table_schema = $1 and table_name = $2 order by ordinal_position`,
    [schema, table],
  );
  return res.rows.map((r) => ({
    name: String(r.column_name),
    generated: r.is_generated === "ALWAYS" || r.identity_generation === "ALWAYS",
    notNull: r.is_nullable === "NO",
    hasDefault: r.column_default !== null || r.is_identity === "YES",
  }));
}
