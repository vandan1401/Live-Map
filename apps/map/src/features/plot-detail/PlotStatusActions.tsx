import { useState } from "react";
import { isLegalTransition } from "../../lib/plot-status/transitions.ts";
import { isRecentlyEdited } from "../../lib/plot-status/recentEdit.ts";
import { formatActorName, formatStatusLabel } from "../../shared/format.ts";
import type { PlotHistoryRow, PlotRow, PlotStatus } from "../../lib/db/types.ts";

const ALL_STATUSES: PlotStatus[] = ["available", "booked", "registered"];

interface Props {
  plot: PlotRow;
  history: PlotHistoryRow[];
  actor: string;
  saving: boolean;
  // ownerName is set only for a fresh available -> booked transition (docs/plans/08.md)
  // — every other status button omits it.
  onChangeStatus: (toStatus: PlotStatus, ownerName?: string) => void;
  onUndo: () => void;
  // Resolved by PlotDetailSheet.tsx from presentation.json (docs/plans/27.md) — omitted
  // falls back to formatStatusLabel's own default text.
  statusLabels?: Partial<Record<PlotStatus, string>>;
}

// Undo is a new forward transition, never a delete (spec/04) — eligible only when the
// most recent history row is the current actor's own change (so nobody undoes someone
// else's edit from their own device) AND the reverse transition is itself legal — the
// three-status table has no back-edge from every state (e.g. registered -> booked isn't
// legal), so an "undo" back past two changes could land on an illegal transition.
function canUndo(plot: PlotRow, history: PlotHistoryRow[], actor: string): boolean {
  return (
    history.length >= 2 &&
    history[0].changed_by === actor &&
    isLegalTransition(plot.status, history[1].status)
  );
}

export function PlotStatusActions({
  plot,
  history,
  actor,
  saving,
  statusLabels,
  onChangeStatus,
  onUndo,
}: Props) {
  const [ownerNameDraft, setOwnerNameDraft] = useState("");
  const nextStatuses = ALL_STATUSES.filter((status) => isLegalTransition(plot.status, status));
  const showRecentEditWarning =
    plot.updated_by !== actor && isRecentlyEdited(plot.updated_at, new Date());
  // available is the only predecessor of booked (transitions.ts) — this is the one and
  // only place a fresh booking is created, so it's the one place that needs a buyer name
  // (docs/plans/08.md).
  const canBook = nextStatuses.includes("booked");
  const otherStatuses = nextStatuses.filter((status) => status !== "booked");

  return (
    <div className="plot-status-actions">
      {showRecentEditWarning && (
        <p className="plot-status-warning">
          {formatActorName(plot.updated_by)} edited this a few minutes ago — check before you save.
        </p>
      )}
      {canBook && (
        <div className="plot-status-owner-row">
          <input
            type="text"
            className="plot-status-owner-input"
            placeholder="Buyer name"
            value={ownerNameDraft}
            onChange={(event) => setOwnerNameDraft(event.target.value)}
            disabled={saving}
          />
          <button
            type="button"
            className="plot-status-button"
            disabled={saving || ownerNameDraft.trim() === ""}
            onClick={() => onChangeStatus("booked", ownerNameDraft.trim())}
          >
            Mark Booked
          </button>
        </div>
      )}
      <div className="plot-status-buttons">
        {otherStatuses.map((status) => (
          <button
            key={status}
            type="button"
            className="plot-status-button"
            disabled={saving}
            onClick={() => onChangeStatus(status)}
          >
            Mark {formatStatusLabel(status, statusLabels)}
          </button>
        ))}
        {canUndo(plot, history, actor) && (
          <button
            type="button"
            className="plot-status-button plot-status-undo"
            disabled={saving}
            onClick={onUndo}
          >
            Undo my last change
          </button>
        )}
      </div>
    </div>
  );
}
