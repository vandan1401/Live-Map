import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBulkImportCsv, type BulkImportParseError } from "../../lib/colony/parseBulkImportFile.ts";
import { bulkImportInitialPlotData } from "../../lib/colony/bulkImportInitialPlotData.ts";
import type { BulkImportResult, BulkImportRow } from "../../lib/db/types.ts";

interface Props {
  client: SupabaseClient;
  colonyId: string;
  onClose: () => void;
}

type Stage =
  | { kind: "picking" }
  | { kind: "parse-error"; fileName: string; errors: BulkImportParseError[] }
  | { kind: "ready"; fileName: string; rows: BulkImportRow[] }
  | { kind: "importing"; fileName: string }
  | { kind: "done"; result: BulkImportResult }
  | { kind: "failed"; message: string };

// One-time initial-data event (docs/plans/10.md §2.2) — the entry point is always
// visible from the table toolbar, no client-side eligibility pre-check; the RPC's own
// per-row `skipped` list (rendered below) is the single source of truth for what did and
// didn't land, so this screen never has to guess or duplicate that rule.
export function BulkImportScreen({ client, colonyId, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "picking" });

  const handleFile = (file: File) => {
    // XLSX support is scoped but not yet implemented in this build pass (see
    // PROGRESS.md's Deferred entry for docs/plans/10.md) — rejected here with a clear
    // message rather than silently mis-parsed as plain text.
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStage({
        kind: "parse-error",
        fileName: file.name,
        errors: [{ row: 1, message: "Only .csv files are supported right now." }],
      });
      return;
    }
    file
      .text()
      .then((raw) => {
        const result = parseBulkImportCsv(raw);
        if (result.ok) {
          setStage({ kind: "ready", fileName: file.name, rows: result.rows });
        } else {
          setStage({ kind: "parse-error", fileName: file.name, errors: result.errors });
        }
      })
      .catch(() => {
        setStage({
          kind: "parse-error",
          fileName: file.name,
          errors: [{ row: 1, message: "Could not read this file." }],
        });
      });
  };

  const handleImport = (fileName: string, rows: BulkImportRow[]) => {
    setStage({ kind: "importing", fileName });
    bulkImportInitialPlotData(client, colonyId, rows)
      .then((result) => setStage({ kind: "done", result }))
      .catch((error: unknown) => {
        setStage({ kind: "failed", message: error instanceof Error ? error.message : "Import failed." });
      });
  };

  return (
    <div className="bulk-import-overlay">
      <div className="bulk-import-panel">
        <button type="button" className="bulk-import-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 className="bulk-import-title">Import initial data</h2>
        <p className="bulk-import-hint">
          CSV columns, in order: svg_id, status, owner_name, owner_phone, broker_name,
          rate_paise, booking_amount_paise, booking_date, registry_date, notes.
        </p>

        {stage.kind === "picking" && (
          <input
            type="file"
            accept=".csv"
            aria-label="Choose a CSV file"
            className="bulk-import-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        )}

        {stage.kind === "parse-error" && (
          <>
            <p className="bulk-import-error">{stage.fileName} could not be used:</p>
            <ul className="bulk-import-error-list">
              {stage.errors.map((error) => (
                <li key={`${error.row}-${error.message}`}>
                  Row {error.row}: {error.message}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="bulk-import-retry"
              onClick={() => setStage({ kind: "picking" })}
            >
              Choose another file
            </button>
          </>
        )}

        {stage.kind === "ready" && (
          <>
            <p className="bulk-import-summary">
              {stage.fileName}: {stage.rows.length} row(s) ready to import.
            </p>
            <button
              type="button"
              className="bulk-import-confirm"
              onClick={() => handleImport(stage.fileName, stage.rows)}
            >
              Import
            </button>
          </>
        )}

        {stage.kind === "importing" && (
          <p className="bulk-import-summary">Importing {stage.fileName}…</p>
        )}

        {stage.kind === "done" && (
          <>
            <p className="bulk-import-summary">{stage.result.applied.length} plot(s) updated.</p>
            {stage.result.skipped.length > 0 && (
              <>
                <p className="bulk-import-summary">{stage.result.skipped.length} skipped:</p>
                <ul className="bulk-import-error-list">
                  {stage.result.skipped.map((skip) => (
                    <li key={skip.svgId}>
                      {skip.svgId}: {skip.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="bulk-import-confirm" onClick={onClose}>
              Done
            </button>
          </>
        )}

        {stage.kind === "failed" && <p className="bulk-import-error">{stage.message}</p>}
      </div>
    </div>
  );
}
