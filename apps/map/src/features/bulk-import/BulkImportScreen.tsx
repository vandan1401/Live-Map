import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseSimpleBulkImportCsv,
  type PlotIdentity,
  type SimpleBulkImportSkip,
} from "../../lib/colony/parseBulkImportFile.ts";
import { bulkImportInitialPlotData } from "../../lib/colony/bulkImportInitialPlotData.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";
import { fetchPlotsByColony } from "../../lib/db/plots.ts";
import type { BulkImportResult, BulkImportRow } from "../../lib/db/types.ts";

interface Props {
  client: SupabaseClient;
  colonyId: string;
  onClose: () => void;
}

type Stage =
  | { kind: "loading-plots" }
  | { kind: "load-failed"; message: string }
  | { kind: "picking"; plots: PlotIdentity[] }
  | { kind: "parse-error"; fileName: string; message: string }
  | { kind: "ready"; fileName: string; rows: BulkImportRow[]; skipped: SimpleBulkImportSkip[] }
  | { kind: "importing"; fileName: string }
  | { kind: "done"; result: BulkImportResult }
  | { kind: "failed"; message: string };

// One-time initial-data event (docs/plans/10.md §2.2, format simplified 2026-08-24 per
// owner ask — see lib/colony/parseBulkImportFile.ts). The entry point is always visible
// from the table toolbar, no client-side eligibility pre-check; the RPC's own per-row
// `skipped` list (rendered below, alongside this screen's own pre-import skip list for
// unmatched plots) is the single source of truth for what did and didn't land.
export function BulkImportScreen({ client, colonyId, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "loading-plots" });

  useEffect(() => {
    let cancelled = false;
    fetchPlotsByColony(client, colonyId)
      .then((plots) => {
        if (cancelled) return;
        setStage({
          kind: "picking",
          plots: plots.map((p) => ({ svgId: p.svg_id, block: p.block, number: p.number })),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStage({
          kind: "load-failed",
          message: error instanceof Error ? error.message : "Could not load this colony's plots.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, colonyId]);

  const handleFile = (file: File, plots: PlotIdentity[]) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStage({ kind: "parse-error", fileName: file.name, message: "Only .csv files are supported." });
      return;
    }
    file
      .text()
      .then((raw) => {
        const { noOwnerTokens } = resolvePresentationConfig(colonyId);
        const { rows, skipped } = parseSimpleBulkImportCsv(raw, plots, noOwnerTokens);
        setStage({ kind: "ready", fileName: file.name, rows, skipped });
      })
      .catch(() => {
        setStage({ kind: "parse-error", fileName: file.name, message: "Could not read this file." });
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
          CSV columns: plot, then the booked owner's name (leave blank or write NMC if
          nobody's booked it). Any other columns in the sheet are ignored.
        </p>

        {stage.kind === "loading-plots" && <p className="bulk-import-summary">Loading this colony's plots…</p>}

        {stage.kind === "load-failed" && <p className="bulk-import-error">{stage.message}</p>}

        {stage.kind === "picking" && (
          <input
            type="file"
            accept=".csv"
            aria-label="Choose a CSV file"
            className="bulk-import-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file, stage.plots);
            }}
          />
        )}

        {stage.kind === "parse-error" && (
          <>
            <p className="bulk-import-error">
              {stage.fileName} could not be used: {stage.message}
            </p>
            <button
              type="button"
              className="bulk-import-retry"
              onClick={() => setStage({ kind: "loading-plots" })}
            >
              Choose another file
            </button>
          </>
        )}

        {stage.kind === "ready" && (
          <>
            <p className="bulk-import-summary">
              {stage.fileName}: {stage.rows.length} plot(s) ready to import.
            </p>
            {stage.skipped.length > 0 && (
              <>
                <p className="bulk-import-summary">{stage.skipped.length} row(s) skipped:</p>
                <ul className="bulk-import-error-list">
                  {stage.skipped.map((skip) => (
                    <li key={`${skip.row}-${skip.plotText}`}>
                      Row {skip.row} ("{skip.plotText}"): {skip.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button
              type="button"
              className="bulk-import-confirm"
              disabled={stage.rows.length === 0}
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
