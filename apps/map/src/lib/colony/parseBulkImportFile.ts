// Pure, DOM-free (NAVIGATION.md's Domain layer) parser for the plot-status CSV import
// (owner ask, 2026-08-24, superseding docs/plans/10.md's fixed 10-column contract). Only
// two columns matter — plot and the booked owner's name — and everything else in the
// sheet, however many extra columns it has, is simply never read. Status is never a column
// in the file: it is derived from whether an owner name is present, so a real working
// spreadsheet full of unrelated columns can be exported as-is with no cleanup.
import { formatPlotLabel } from "../../shared/format.ts";
import type { BulkImportRow } from "../db/types.ts";

// The identity fields needed to resolve a sheet's plot text to a real plot — callers fetch
// this from lib/db/plots.ts (fetchPlotsByColony) and pass it in, keeping this module pure.
export interface PlotIdentity {
  svgId: string;
  block: string;
  number: string;
}

export interface SimpleBulkImportSkip {
  // 1-based, counting the header as row 1 — matches what a spreadsheet user sees.
  row: number;
  plotText: string;
  reason: string;
}

export interface SimpleBulkImportResult {
  rows: BulkImportRow[];
  skipped: SimpleBulkImportSkip[];
}

// A blank owner cell or the literal token "NMC" (the owner's own sheet convention for "no
// name/company") both mean the plot has no real booking — anything else is treated as a
// real owner name, typos and all, since this format deliberately does no validation of it.
const NO_OWNER_TOKENS = new Set(["", "NMC"]);

function normalisePlotLabel(text: string): string {
  return text.trim().toUpperCase().replace(/\s*-\s*/g, "-");
}

// Shared by the CSV path (parseSimpleBulkImportCsv) and a future XLSX adapter — both
// reduce to a plain array-of-arrays of cell strings before reaching here, mirroring the
// old strict parser's own split (docs/plans/10.md).
export function parseSimpleBulkImportRows(
  rows: string[][],
  plots: PlotIdentity[],
): SimpleBulkImportResult {
  const svgIdByLabel = new Map<string, string>();
  for (const plot of plots) {
    svgIdByLabel.set(normalisePlotLabel(formatPlotLabel(plot)), plot.svgId);
  }

  const bulkRows: BulkImportRow[] = [];
  const skipped: SimpleBulkImportSkip[] = [];
  const seenSvgIds = new Set<string>();

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2; // row 1 is always the header, its text is never read
    if (cells.every((cell) => cell.trim() === "")) return; // blank line

    const plotText = (cells[0] ?? "").trim();
    if (plotText === "") {
      skipped.push({ row: rowNumber, plotText, reason: "plot is required" });
      return;
    }

    const svgId = svgIdByLabel.get(normalisePlotLabel(plotText));
    if (svgId === undefined) {
      skipped.push({ row: rowNumber, plotText, reason: "no matching plot in this colony" });
      return;
    }
    if (seenSvgIds.has(svgId)) {
      skipped.push({ row: rowNumber, plotText, reason: "duplicate plot in this file" });
      return;
    }
    seenSvgIds.add(svgId);

    const ownerRaw = (cells[1] ?? "").trim();
    const hasOwner = !NO_OWNER_TOKENS.has(ownerRaw.toUpperCase());

    bulkRows.push({
      svg_id: svgId,
      status: hasOwner ? "booked" : "available",
      owner_name: hasOwner ? ownerRaw : null,
      owner_phone: null,
      broker_name: null,
      rate_paise: null,
      booking_amount_paise: null,
      booking_date: null,
      registry_date: null,
      notes: null,
    });
  });

  return { rows: bulkRows, skipped };
}

// No quoted-field/embedded-comma support — matches scripts/import-seed.ts's own CSV
// parser precedent. An owner name with a comma in it isn't expected in practice; extra
// columns beyond the first two are trimmed by construction (they're simply never indexed).
export function parseSimpleBulkImportCsv(raw: string, plots: PlotIdentity[]): SimpleBulkImportResult {
  const lines = raw.trim().split(/\r?\n/);
  const rows = lines.map((line) => line.split(","));
  return parseSimpleBulkImportRows(rows, plots);
}
