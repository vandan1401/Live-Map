import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlotTransition } from "../../lib/plot-status/applyPlotTransition.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";
import { fetchPlotBySvgId, fetchPlotsByColony } from "../../lib/db/plots.ts";
import { subscribePlotChanges } from "../../lib/sync/subscribePlots.ts";
import { BulkImportScreen } from "../bulk-import/BulkImportScreen.tsx";
import { PlotTableRow } from "./PlotTableRow.tsx";
import type { PlotRow, PlotStatus } from "../../lib/db/types.ts";

interface Props {
  client: SupabaseClient;
  colonyId: string;
  onBack: () => void;
}

interface RowDraft {
  pendingStatus: PlotStatus | null;
  ownerNameDraft: string;
  saving: boolean;
  conflictWinner: string | null;
  error: string | null;
}

const EMPTY_DRAFT: RowDraft = {
  pendingStatus: null,
  ownerNameDraft: "",
  saving: false,
  conflictWinner: null,
  error: null,
};

// Ongoing status/owner-name edits for a whole colony at once (docs/plans/10.md §2.3) — a
// grid alternative to clicking through the map one plot at a time. Every row's save still
// goes through applyPlotTransition() independently, exactly like the map's own Save
// button; no "save all" batching (§3).
export function PlotTableView({ client, colonyId, onBack }: Props) {
  const [plots, setPlots] = useState<PlotRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [showImport, setShowImport] = useState(false);
  // docs/plans/27.md — per-colony status display names, resolved once per colonyId.
  const { statusLabels } = resolvePresentationConfig(colonyId);

  useEffect(() => {
    let cancelled = false;
    setPlots(null);
    setLoadError(false);
    fetchPlotsByColony(client, colonyId)
      .then((rows) => {
        if (!cancelled) setPlots(rows);
      })
      .catch((error: unknown) => {
        console.error("plot table load failed:", error);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, colonyId]);

  useEffect(() => {
    // A single-row refetch on each notification, not a payload-shape change to
    // subscribePlotChanges — attachSync.ts already depends on that function's current
    // svg_id+status-only payload for the offline snapshot cache, and widening it would
    // touch a small, heavily-tuned Tier 1 sync primitive well beyond this plan's scope.
    // This table is a few hundred rows at most, so one extra fetch per external change is
    // the lower-risk choice.
    let wasConnected = true;
    const unsubscribe = subscribePlotChanges(client, colonyId, {
      onChange: (svgId) => {
        fetchPlotBySvgId(client, colonyId, svgId)
          .then((updated) => {
            if (!updated) return;
            setPlots((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
          })
          .catch((error: unknown) => console.error("plot table live refetch failed:", error));
      },
      // A missed UPDATE while the channel is down is invisible and permanent
      // (tier-1.md's "Cache and freshness" — the same rule attachSync.ts's reconnect
      // refetch already follows for the map). Refetch the whole colony on a genuine
      // disconnected -> connected transition rather than trusting nothing was missed.
      onStatusChange: (status) => {
        const connected = status === "connected";
        if (connected && !wasConnected) {
          fetchPlotsByColony(client, colonyId)
            .then((rows) => setPlots(rows))
            .catch((error: unknown) => console.error("plot table reconnect refetch failed:", error));
        }
        wasConnected = connected;
      },
    });
    return unsubscribe;
  }, [client, colonyId]);

  const draftFor = (plotId: string): RowDraft => drafts[plotId] ?? EMPTY_DRAFT;
  // Reads prev[plotId] inside the updater, not the outer `drafts` closure — handleSave
  // below calls this twice in the same tick (once for the result, once in `finally`), and
  // reading the outer closure would let the second call silently overwrite the first
  // with stale data from before either had committed.
  const patchDraft = (plotId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({ ...prev, [plotId]: { ...(prev[plotId] ?? EMPTY_DRAFT), ...patch } }));
  };

  const handleSave = async (plot: PlotRow) => {
    const draft = draftFor(plot.id);
    if (!draft.pendingStatus) return;
    const ownerName =
      plot.status === "available" && draft.pendingStatus === "booked"
        ? draft.ownerNameDraft.trim()
        : undefined;

    patchDraft(plot.id, { saving: true, conflictWinner: null, error: null });
    try {
      const result = await applyPlotTransition(client, {
        plotId: plot.id,
        fromStatus: plot.status,
        toStatus: draft.pendingStatus,
        expectedVersion: plot.version,
        ownerName,
      });
      if (result.ok) {
        setPlots((prev) => (prev ? prev.map((p) => (p.id === plot.id ? result.plot : p)) : prev));
        setDrafts((prev) => ({ ...prev, [plot.id]: EMPTY_DRAFT }));
      } else if (result.reason === "conflict") {
        patchDraft(plot.id, { conflictWinner: result.winnerName });
      } else {
        // illegal_transition — the dropdown only ever offers legal next statuses, so this
        // is an unexpected mismatch (e.g. another tab moved this plot on), not a user
        // error. Mirrors PlotDetailSheet.tsx's handling of the same outcome.
        patchDraft(plot.id, { error: "That change is no longer valid — reload and try again." });
      }
    } catch (err: unknown) {
      // applyPlotTransition() throws for anything other than the two typed outcomes
      // above (network failure, unknown Postgres error) — without this catch, `saving`
      // never clears and the row locks up permanently (docs/plans/10.md /review finding).
      patchDraft(plot.id, {
        error: err instanceof Error ? err.message : "Could not save this change.",
      });
    } finally {
      patchDraft(plot.id, { saving: false });
    }
  };

  if (loadError) {
    return (
      <div className="plot-table-container">
        <p className="plot-table-error">Could not load plots. Check your connection.</p>
        <button type="button" className="plot-table-back" onClick={onBack}>
          ← Back to map
        </button>
      </div>
    );
  }
  if (!plots) return null;

  return (
    <div className="plot-table-container">
      <div className="plot-table-toolbar">
        <button type="button" className="plot-table-back" onClick={onBack}>
          ← Back to map
        </button>
        <button
          type="button"
          className="plot-table-import-trigger"
          onClick={() => setShowImport(true)}
        >
          Import initial data (CSV)
        </button>
      </div>
      <div className="plot-table-scroll">
        <table className="plot-table">
          <thead>
            <tr>
              <th>Plot</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Phone</th>
              <th>Broker</th>
              <th>Rate</th>
              <th>Booking amount</th>
              <th>Booking date</th>
              <th>Registry date</th>
              <th>Notes</th>
              <th>Updated by</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plots.map((plot) => {
              const draft = draftFor(plot.id);
              return (
                <PlotTableRow
                  key={plot.id}
                  plot={plot}
                  pendingStatus={draft.pendingStatus}
                  ownerNameDraft={draft.ownerNameDraft}
                  saving={draft.saving}
                  conflictWinner={draft.conflictWinner}
                  error={draft.error}
                  statusLabels={statusLabels}
                  onPendingStatusChange={(status) => patchDraft(plot.id, { pendingStatus: status })}
                  onOwnerNameChange={(value) => patchDraft(plot.id, { ownerNameDraft: value })}
                  onSave={() => void handleSave(plot)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {showImport && (
        <BulkImportScreen client={client} colonyId={colonyId} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
