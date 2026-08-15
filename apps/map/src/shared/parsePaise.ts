// Integer-paise parsing shared by every place that reads a paise value from outside the
// app's own typed state — scripts/import-seed.ts's CSV load and the CSV/XLSX bulk-import
// (docs/plans/10.md, lib/colony/parseBulkImportFile.ts). Money is an integer paise count
// at every layer (invariant 3, D-010); this is the one place a free-text string becomes
// one, so a change to what counts as valid only ever needs to happen here.
export function parseNullablePaise(
  value: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  // A regex gate, not just Number.isInteger(Number.parseInt(...)) — parseInt("12.5", 10)
  // returns the integer 12 with no indication a decimal was silently dropped, which is
  // exactly the kind of float-adjacent mistake D-010 exists to make impossible. Found
  // while extracting this out of scripts/import-seed.ts's original (looser) version for
  // docs/plans/10.md — fixed here since both callers now share this one function.
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: `non-integer paise value: "${value}"` };
  }
  return { ok: true, value: Number.parseInt(trimmed, 10) };
}
