import { describe, expect, it } from "vitest";
import { parseArgs, requireUuid } from "./args.ts";
import { planColumns, type ColumnInfo } from "./columns.ts";
import { compareCounts, type Counts } from "./counts.ts";
import { checkExportIntegrity, type LoadedExport } from "./preflight.ts";
import { buildInsertSql, buildSelectSql } from "./sql.ts";
import { TENANT_TABLES } from "./tables.ts";

const col = (name: string, o: Partial<ColumnInfo> = {}): ColumnInfo => ({
  name,
  generated: false,
  notNull: false,
  hasDefault: false,
  ...o,
});

describe("parseArgs", () => {
  it("reads value flags and bool flags", () => {
    const a = parseArgs(["--in", "x", "--dry-run"], ["in"], ["dry-run"]);
    expect(a.values.in).toBe("x");
    expect(a.flags.has("dry-run")).toBe(true);
  });
  it("refuses a typo'd flag instead of ignoring it", () => {
    expect(() => parseArgs(["--dry-runn"], [], ["dry-run"])).toThrow(/unknown flag/);
  });
  it("refuses a value flag with no value", () => {
    expect(() => parseArgs(["--in", "--dry-run"], ["in"], ["dry-run"])).toThrow(/needs a value/);
  });
  it("requireUuid rejects a non-uuid", () => {
    expect(() => requireUuid("not-a-uuid", "--org")).toThrow(/not a uuid/);
  });
});

describe("planColumns", () => {
  const target = [col("id", { notNull: true }), col("a"), col("g", { generated: true })];
  it("copies the intersection and skips generated target columns", () => {
    expect(planColumns("t", ["id", "a", "g"], new Set(), target)).toEqual(["id", "a"]);
  });
  it("refuses when a source-only column holds data", () => {
    expect(() => planColumns("t", ["id", "extra"], new Set(["extra"]), target)).toThrow(/extra/);
  });
  it("accepts a source-only column that is null everywhere", () => {
    expect(planColumns("t", ["id", "extra"], new Set(), target)).toEqual(["id"]);
  });
  it("refuses when the target needs a column the export lacks", () => {
    const needy = [...target, col("must", { notNull: true })];
    expect(() => planColumns("t", ["id", "a"], new Set(), needy)).toThrow(/must/);
  });
  it("allows a missing target column that has a default", () => {
    const ok = [...target, col("d", { notNull: true, hasDefault: true })];
    expect(planColumns("t", ["id", "a"], new Set(), ok)).toEqual(["id", "a"]);
  });
});

describe("compareCounts", () => {
  const base: Counts = {
    tables: { "public.plots": 26 },
    perColony: { c1: { plots: 26, history: 78 } },
  };
  it("is empty for identical counts", () => {
    expect(compareCounts(base, structuredClone(base))).toEqual([]);
  });
  it("names a table and a colony that differ, with numbers only", () => {
    const other: Counts = {
      tables: { "public.plots": 25 },
      perColony: { c1: { plots: 25, history: 77 } },
    };
    const out = compareCounts(base, other).join("|");
    expect(out).toContain("public.plots: expected 26, got 25");
    expect(out).toContain("colony c1 history: expected 78, got 77");
  });
});

describe("SQL builders", () => {
  const plots = TENANT_TABLES.find((t) => t.table === "plots")!;
  it("selects jsonb text ordered by id, scoped by the table's where", () => {
    const sql = buildSelectSql(plots, ["id", "rate_paise"]);
    expect(sql).toContain('to_jsonb(r)::text');
    expect(sql).toContain('from "public"."plots" where org_id = $1::uuid order by id');
  });
  it("inserts only the listed columns from jsonb, with no ON CONFLICT", () => {
    const sql = buildInsertSql(plots, ["id", "rate_paise"]);
    expect(sql).toContain('insert into "public"."plots" ("id", "rate_paise")');
    expect(sql).toContain("jsonb_populate_recordset");
    expect(sql.toLowerCase()).not.toContain("on conflict");
  });
});

function goodExport(): LoadedExport {
  const org = "11111111-1111-1111-1111-111111111111";
  return {
    orgId: org,
    rows: {
      "public.organizations": [{ id: org }],
      "public.colonies": [{ id: "c1", org_id: org, svg: '<path id="plot-A-1"/>' }],
      "public.plots": [{ id: "p1", org_id: org, colony_id: "c1", svg_id: "plot-A-1" }],
      "public.plot_history": [{ id: "h1", org_id: org, plot_id: "p1" }],
      "auth.users": [
        { id: "u1", email: "vandan@colony.local", instance_id: "00000000-0000-0000-0000-000000000000" },
      ],
      "auth.identities": [{ id: "i1", user_id: "u1" }],
    },
  };
}

describe("checkExportIntegrity", () => {
  it("passes a consistent export", () => {
    expect(checkExportIntegrity(goodExport())).toEqual([]);
  });
  it("flags a plot whose svg_id is not in its colony's svg (orphan rule)", () => {
    const e = goodExport();
    e.rows["public.plots"][0].svg_id = "plot-A-99";
    expect(checkExportIntegrity(e).join("|")).toMatch(/svg_id is not in its colony's svg/);
  });
  it("flags history with no plot and identities with no user", () => {
    const e = goodExport();
    e.rows["public.plot_history"][0].plot_id = "nope";
    e.rows["auth.identities"][0].user_id = "nope";
    const out = checkExportIntegrity(e).join("|");
    expect(out).toMatch(/plot_history: 1 row\(s\) with no plot/);
    expect(out).toMatch(/identities: 1 row\(s\) with no user/);
  });
  it("flags a row from a different org and a non-username account", () => {
    const e = goodExport();
    e.rows["public.plots"][0].org_id = "22222222-2222-2222-2222-222222222222";
    e.rows["auth.users"][0].email = "someone@example.com";
    const out = checkExportIntegrity(e).join("|");
    expect(out).toMatch(/different org/);
    expect(out).toMatch(/not username accounts/);
  });
  it("never puts row contents in a problem message", () => {
    const e = goodExport();
    e.rows["auth.users"][0].email = "secret-person@example.com";
    expect(checkExportIntegrity(e).join("|")).not.toContain("secret-person");
  });
});
