import { describe, expect, it } from "vitest";
import { connect, isLoopback } from "./connect.ts";
import { describeError, TenantError } from "./errors.ts";
import { compareFingerprints } from "./fingerprint.ts";
import { buildFingerprintSql, buildSelectSql } from "./sql.ts";
import { BLANKED_COLUMNS, TENANT_TABLES } from "./tables.ts";

const users = TENANT_TABLES.find((t) => t.table === "users")!;

describe("one-time tokens are blanked, not copied", () => {
  it("selects '' for each blanked column that exists and the real column otherwise", () => {
    const sql = buildSelectSql(users, ["id", "recovery_token", "email"], BLANKED_COLUMNS["auth.users"]);
    expect(sql).toContain(`''::text as "recovery_token"`);
    expect(sql).toContain(`"id", ''::text`);
    expect(sql).toContain('"email" from');
  });
  it("covers every token column GoTrue keeps on auth.users", () => {
    for (const c of [
      "confirmation_token",
      "recovery_token",
      "email_change_token_new",
      "email_change_token_current",
      "phone_change_token",
      "reauthentication_token",
    ]) {
      expect(BLANKED_COLUMNS["auth.users"]).toContain(c);
    }
  });
});

describe("fingerprints", () => {
  it("hashes ordered rows of the listed columns only", () => {
    const sql = buildFingerprintSql(users, ["id", "email"]);
    expect(sql).toContain("md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id)");
    expect(sql).toContain('select "id", "email" from "auth"."users"');
  });
  it("names the table whose content moved, nothing else", () => {
    expect(compareFingerprints({ a: "1", b: "2" }, { a: "1", b: "9" })).toEqual([
      "b: content changed since the snapshot",
    ]);
    expect(compareFingerprints({ a: "1" }, { a: "1" })).toEqual([]);
  });
});

describe("describeError", () => {
  it("passes a TenantError through", () => {
    expect(describeError(new TenantError("refused: x"))).toBe("refused: x");
  });
  it("reduces a database error to code, table, column and constraint, never message or detail", () => {
    const pgErr = Object.assign(new Error('invalid input syntax for type uuid: "secret-owner-name"'), {
      code: "23505",
      table: "plots",
      constraint: "plots_pkey",
      detail: "Key (id)=(secret-owner-name) already exists.",
    });
    const out = describeError(pgErr);
    expect(out).toBe("database error (code 23505, table plots, constraint plots_pkey)");
    expect(out).not.toContain("secret-owner-name");
  });
  it("does not echo an unknown error's message", () => {
    expect(describeError(new Error("postgresql://u:hunter2@host/db"))).toBe("unexpected error (Error)");
  });
});

describe("connect", () => {
  it("recognises loopback hosts", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("db.example.supabase.co")).toBe(false);
  });
  it("refuses a remote database without a CA file, before any network use", async () => {
    await expect(
      connect({ databaseUrl: "postgresql://u:p@db.example.invalid:5432/postgres", supabaseUrl: "x", serviceRoleKey: "y" }),
    ).rejects.toThrow(/DATABASE_CA_FILE/);
  });
});
