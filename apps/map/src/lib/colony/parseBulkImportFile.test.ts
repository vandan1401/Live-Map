import { describe, expect, it } from "vitest";
import { parseBulkImportCsv, parseBulkImportRows } from "./parseBulkImportFile.ts";

const HEADER =
  "svg_id,status,owner_name,owner_phone,broker_name,rate_paise,booking_amount_paise,booking_date,registry_date,notes";

describe("parseBulkImportCsv", () => {
  it("parses a well-formed file into typed rows", () => {
    const csv = [
      HEADER,
      "plot-A-01,booked,Rajesh Shah,9876543210,Vikas Broker,150000000,15000000,2026-01-10,,",
      "plot-A-02,available,,,,,,,,",
    ].join("\n");

    const result = parseBulkImportCsv(csv);
    expect(result.ok).toBe(true);
    const rows = (result as { ok: true; rows: unknown[] }).rows;
    expect(rows).toEqual([
      {
        svg_id: "plot-A-01",
        status: "booked",
        owner_name: "Rajesh Shah",
        owner_phone: "9876543210",
        broker_name: "Vikas Broker",
        rate_paise: 150000000,
        booking_amount_paise: 15000000,
        booking_date: "2026-01-10",
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

  it("rejects a file whose header does not match the fixed contract exactly", () => {
    const csv = ["svg_id,status,owner", "plot-A-01,booked,Rajesh"].join("\n");
    const result = parseBulkImportCsv(csv);
    expect(result.ok).toBe(false);
    const errors = (result as { ok: false; errors: { row: number; message: string }[] }).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(1);
  });

  it("rejects an unrecognised status with the offending row number", () => {
    const csv = [HEADER, "plot-A-01,sold,,,,,,,,"].join("\n");
    const result = parseBulkImportCsv(csv);
    expect(result.ok).toBe(false);
    const errors = (result as { ok: false; errors: { row: number; message: string }[] }).errors;
    expect(errors).toEqual([{ row: 2, message: 'unrecognised status "sold"' }]);
  });

  it("rejects a non-integer paise value with the offending row number", () => {
    const csv = [HEADER, "plot-A-01,available,,,,12.5,,,,"].join("\n");
    const result = parseBulkImportCsv(csv);
    expect(result.ok).toBe(false);
    const errors = (result as { ok: false; errors: { row: number; message: string }[] }).errors;
    expect(errors[0].row).toBe(2);
    expect(errors[0].message).toContain("rate_paise");
  });

  it("rejects a repeated svg_id rather than silently applying it twice", () => {
    const csv = [HEADER, "plot-A-01,available,,,,,,,,", "plot-A-01,booked,,,,,,,,"].join("\n");
    const result = parseBulkImportCsv(csv);
    expect(result.ok).toBe(false);
    const errors = (result as { ok: false; errors: { row: number; message: string }[] }).errors;
    expect(errors).toEqual([{ row: 3, message: 'duplicate svg_id "plot-A-01"' }]);
  });

  it("collects every row's error, not just the first", () => {
    const csv = [HEADER, "plot-A-01,sold,,,,,,,,", "plot-A-02,also-bad,,,,,,,,"].join("\n");
    const result = parseBulkImportCsv(csv);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: unknown[] }).errors).toHaveLength(2);
  });
});

describe("parseBulkImportRows (shared by an XLSX adapter)", () => {
  it("accepts the same shape as the CSV path, pre-split into cells", () => {
    const rows = [HEADER.split(","), ["plot-A-01", "available", "", "", "", "", "", "", "", ""]];
    const result = parseBulkImportRows(rows);
    expect(result.ok).toBe(true);
  });

  it("flags an empty file", () => {
    const result = parseBulkImportRows([]);
    expect(result.ok).toBe(false);
  });
});
