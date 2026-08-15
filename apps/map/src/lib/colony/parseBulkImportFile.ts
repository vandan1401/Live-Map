// Pure, DOM-free (NAVIGATION.md's Domain layer) parser for the CSV/XLSX initial-import
// file (docs/plans/10.md §2.2). No column-mapping — the header must match this fixed
// contract exactly, in order (a mismatch is a parse error, not a mapping prompt, see the
// plan's non-goals). A file with any row error is rejected outright; nothing is ever
// partially submitted from a malformed file.
import { parseNullablePaise } from "../../shared/parsePaise.ts";
import type { BulkImportRow, PlotStatus } from "../db/types.ts";

const EXPECTED_HEADER = [
  "svg_id",
  "status",
  "owner_name",
  "owner_phone",
  "broker_name",
  "rate_paise",
  "booking_amount_paise",
  "booking_date",
  "registry_date",
  "notes",
];

const STATUSES: PlotStatus[] = ["available", "booked", "registered"];

export interface BulkImportParseError {
  // 1-based, counting the header as row 1 — matches what a spreadsheet user sees, not a
  // zero-based array index.
  row: number;
  message: string;
}

export type BulkImportParseResult =
  | { ok: true; rows: BulkImportRow[] }
  | { ok: false; errors: BulkImportParseError[] };

function nullableText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// Shared by the CSV path (parseBulkImportCsv) and an XLSX adapter — both reduce to a
// plain array-of-arrays of cell strings before reaching here, so the validation rules
// never diverge between the two file formats.
export function parseBulkImportRows(rows: string[][]): BulkImportParseResult {
  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 1, message: "file is empty" }] };
  }

  const header = rows[0];
  const headerMatches =
    header.length === EXPECTED_HEADER.length &&
    header.every((cell, i) => cell.trim() === EXPECTED_HEADER[i]);
  if (!headerMatches) {
    return {
      ok: false,
      errors: [
        {
          row: 1,
          message: `header must be exactly: ${EXPECTED_HEADER.join(",")} (got: ${header.join(",")})`,
        },
      ],
    };
  }

  const errors: BulkImportParseError[] = [];
  const parsed: BulkImportRow[] = [];
  // A repeated svg_id would otherwise apply twice against bulk_set_initial_plot_data
  // (both rows pass the eligibility check, since the sentinel changed_by doesn't change
  // between them) — silent last-wins on exactly the data that seeds owner names and money
  // for a whole colony (docs/plans/10.md /review finding).
  const seenSvgIds = new Set<string>();

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2; // row 1 is the header
    if (cells.length !== EXPECTED_HEADER.length) {
      errors.push({
        row: rowNumber,
        message: `expected ${EXPECTED_HEADER.length} columns, got ${cells.length}`,
      });
      return;
    }
    const [
      svgId,
      statusRaw,
      ownerName,
      ownerPhone,
      brokerName,
      rateRaw,
      bookingAmountRaw,
      bookingDate,
      registryDate,
      notes,
    ] = cells;

    const trimmedSvgId = nullableText(svgId);
    if (trimmedSvgId === null) {
      errors.push({ row: rowNumber, message: "svg_id is required" });
      return;
    }
    if (seenSvgIds.has(trimmedSvgId)) {
      errors.push({ row: rowNumber, message: `duplicate svg_id "${trimmedSvgId}"` });
      return;
    }
    seenSvgIds.add(trimmedSvgId);
    const status = statusRaw.trim() as PlotStatus;
    if (!STATUSES.includes(status)) {
      errors.push({ row: rowNumber, message: `unrecognised status "${statusRaw}"` });
      return;
    }
    const rate = parseNullablePaise(rateRaw ?? "");
    if (!rate.ok) {
      errors.push({ row: rowNumber, message: `rate_paise: ${rate.error}` });
      return;
    }
    const bookingAmount = parseNullablePaise(bookingAmountRaw ?? "");
    if (!bookingAmount.ok) {
      errors.push({ row: rowNumber, message: `booking_amount_paise: ${bookingAmount.error}` });
      return;
    }

    parsed.push({
      svg_id: trimmedSvgId,
      status,
      owner_name: nullableText(ownerName),
      owner_phone: nullableText(ownerPhone),
      broker_name: nullableText(brokerName),
      rate_paise: rate.value,
      booking_amount_paise: bookingAmount.value,
      booking_date: nullableText(bookingDate),
      registry_date: nullableText(registryDate),
      notes: nullableText(notes),
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows: parsed };
}

// No quoted-field/embedded-comma support — matches scripts/import-seed.ts's own CSV
// parser precedent. A family member exporting a plain spreadsheet as CSV won't hit this;
// free text with a comma (e.g. notes) should avoid one or use the XLSX path instead.
export function parseBulkImportCsv(raw: string): BulkImportParseResult {
  const lines = raw.trim().split(/\r?\n/);
  const rows = lines.map((line) => line.split(","));
  return parseBulkImportRows(rows);
}
