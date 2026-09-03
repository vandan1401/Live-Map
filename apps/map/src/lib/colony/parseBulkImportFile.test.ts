import { describe, expect, it } from "vitest";
import {
  parseSimpleBulkImportCsv,
  parseSimpleBulkImportRows,
  type PlotIdentity,
} from "./parseBulkImportFile.ts";

const PLOTS: PlotIdentity[] = [
  { svgId: "plot-A-01", block: "A", number: "01" },
  { svgId: "plot-A-02", block: "A", number: "02" },
  { svgId: "plot-07", block: "", number: "07" },
];

describe("parseSimpleBulkImportCsv", () => {
  it("derives booked from a real owner name and available from a blank cell", () => {
    const csv = ["plot,owner", "A-01,Rajesh Shah", "A-02,"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.skipped).toEqual([]);
    expect(result.rows).toEqual([
      {
        svg_id: "plot-A-01",
        status: "booked",
        owner_name: "Rajesh Shah",
        owner_phone: null,
        broker_name: null,
        rate_paise: null,
        booking_amount_paise: null,
        booking_date: null,
        registry_date: null,
        notes: null,
      },
      {
        svg_id: "plot-A-02",
        status: "available",
        owner_name: null,
        owner_phone: null,
        broker_name: null,
        rate_paise: null,
        booking_amount_paise: null,
        booking_date: null,
        registry_date: null,
        notes: null,
      },
    ]);
  });

  it("treats the literal token NMC (any case) as no owner", () => {
    const csv = ["plot,owner", "A-01,NMC", "A-02,nmc"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows.map((r) => r.status)).toEqual(["available", "available"]);
    expect(result.rows.map((r) => r.owner_name)).toEqual([null, null]);
  });

  it("matches a blockless plot by its bare number", () => {
    const csv = ["plot,owner", "07,Meera Patel"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows).toEqual([
      expect.objectContaining({ svg_id: "plot-07", status: "booked", owner_name: "Meera Patel" }),
    ]);
  });

  it("matches a plot label case-insensitively and ignoring stray spaces around the hyphen", () => {
    const csv = ["plot,owner", "a - 01,Rajesh Shah"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows).toEqual([
      expect.objectContaining({ svg_id: "plot-A-01" }),
    ]);
  });

  it("ignores every column past the first two", () => {
    const csv = [
      "plot,owner,phone,notes,extra",
      "A-01,Rajesh Shah,9876543210,VIP,whatever",
    ].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows).toEqual([
      expect.objectContaining({
        svg_id: "plot-A-01",
        owner_name: "Rajesh Shah",
        owner_phone: null,
        notes: null,
      }),
    ]);
  });

  it("skips, rather than rejects, a row whose plot doesn't match any real plot", () => {
    const csv = ["plot,owner", "Z-99,Someone", "A-01,Rajesh Shah"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.skipped).toEqual([
      { row: 2, plotText: "Z-99", reason: "no matching plot in this colony" },
    ]);
    expect(result.rows).toEqual([expect.objectContaining({ svg_id: "plot-A-01" })]);
  });

  it("skips a repeated plot rather than applying it twice", () => {
    const csv = ["plot,owner", "A-01,Rajesh Shah", "A-01,Someone Else"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toEqual([
      { row: 3, plotText: "A-01", reason: "duplicate plot in this file" },
    ]);
  });

  it("skips a row with no plot text instead of guessing", () => {
    const csv = ["plot,owner", ",Someone"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows).toEqual([]);
    expect(result.skipped).toEqual([{ row: 2, plotText: "", reason: "plot is required" }]);
  });

  it("ignores blank lines", () => {
    const csv = ["plot,owner", "A-01,Rajesh Shah", "", "A-02,"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS);
    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  it("uses a colony-specific no-owner token list instead of the default (docs/plans/27.md)", () => {
    const csv = ["plot,owner", "A-01,IV", "A-02,NMC"].join("\n");
    const result = parseSimpleBulkImportCsv(csv, PLOTS, ["", "IV"]);
    // "IV" is this colony's own no-owner token, so A-01 reads as available; "NMC" is not
    // in this colony's list, so it is treated as a real (if odd) owner name.
    expect(result.rows).toEqual([
      expect.objectContaining({ svg_id: "plot-A-01", status: "available", owner_name: null }),
      expect.objectContaining({ svg_id: "plot-A-02", status: "booked", owner_name: "NMC" }),
    ]);
  });
});

describe("parseSimpleBulkImportRows (shared by a future XLSX adapter)", () => {
  it("accepts the same shape as the CSV path, pre-split into cells", () => {
    const rows = [
      ["plot", "owner"],
      ["A-01", "Rajesh Shah"],
    ];
    const result = parseSimpleBulkImportRows(rows, PLOTS);
    expect(result.rows).toHaveLength(1);
  });

  it("returns no rows and no skips for a header-only file", () => {
    const result = parseSimpleBulkImportRows([["plot", "owner"]], PLOTS);
    expect(result.rows).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
