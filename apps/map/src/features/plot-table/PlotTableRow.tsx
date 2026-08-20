import { isLegalTransition } from "../../lib/plot-status/transitions.ts";
import {
  formatActorName,
  formatDate,
  formatPlotLabel,
  formatRelativeTime,
  formatRupees,
  formatStatusLabel,
} from "../../shared/format.ts";
import type { PlotRow, PlotStatus } from "../../lib/db/types.ts";

const ALL_STATUSES: PlotStatus[] = ["available", "booked", "registered"];

interface Props {
  plot: PlotRow;
  // null = no pending edit on this row; the select shows plot.status as-is.
  pendingStatus: PlotStatus | null;
  ownerNameDraft: string;
  saving: boolean;
  conflictWinner: string | null;
  error: string | null;
  onPendingStatusChange: (status: PlotStatus | null) => void;
  onOwnerNameChange: (value: string) => void;
  onSave: () => void;
}

// One row = one plot's status/owner-name editor, everything else read-only
// (docs/plans/10.md §3 — no write path here for phone/broker/rate/booking
// amount/dates/notes). Pure/presentational, same split as PlotStatusActions.tsx: the
// container (PlotTableView.tsx) owns data loading and the applyPlotTransition() call.
export function PlotTableRow({
  plot,
  pendingStatus,
  ownerNameDraft,
  saving,
  conflictWinner,
  error,
  onPendingStatusChange,
  onOwnerNameChange,
  onSave,
}: Props) {
  const nextStatuses = ALL_STATUSES.filter((status) => isLegalTransition(plot.status, status));
  const displayedStatus = pendingStatus ?? plot.status;
  // Same rule as PlotStatusActions.tsx's "Buyer name" input: only meaningful (and
  // required) on a fresh available -> booked transition.
  const bookingInProgress = plot.status === "available" && pendingStatus === "booked";
  const isDirty = pendingStatus !== null && pendingStatus !== plot.status;
  const canSave = isDirty && !saving && (!bookingInProgress || ownerNameDraft.trim() !== "");

  return (
    <tr className="plot-table-row">
      <td className="plot-table-cell-id">
        {formatPlotLabel(plot)}
      </td>
      <td>
        <select
          className="plot-table-status-select"
          value={displayedStatus}
          disabled={saving}
          onChange={(event) => {
            const next = event.target.value as PlotStatus;
            onPendingStatusChange(next === plot.status ? null : next);
          }}
        >
          <option value={plot.status}>{formatStatusLabel(plot.status)}</option>
          {nextStatuses.map((status) => (
            <option key={status} value={status}>
              {formatStatusLabel(status)}
            </option>
          ))}
        </select>
        {conflictWinner && (
          <p className="plot-table-conflict">
            {conflictWinner} changed this a few minutes ago — check before you save.
          </p>
        )}
        {error && <p className="plot-table-conflict">{error}</p>}
      </td>
      <td>
        {bookingInProgress ? (
          <input
            type="text"
            className="plot-table-owner-input"
            placeholder="Buyer name"
            value={ownerNameDraft}
            disabled={saving}
            onChange={(event) => onOwnerNameChange(event.target.value)}
          />
        ) : (
          (plot.owner_name ?? "—")
        )}
      </td>
      <td>{plot.owner_phone ?? "—"}</td>
      <td>{plot.broker_name ?? "—"}</td>
      <td>{formatRupees(plot.rate_paise)}</td>
      <td>{formatRupees(plot.booking_amount_paise)}</td>
      <td>{formatDate(plot.booking_date)}</td>
      <td>{formatDate(plot.registry_date)}</td>
      <td>{plot.notes ?? "—"}</td>
      <td>{formatActorName(plot.updated_by)}</td>
      <td>{formatRelativeTime(plot.updated_at)}</td>
      <td>
        {isDirty && (
          <button type="button" className="plot-table-save" disabled={!canSave} onClick={onSave}>
            Save
          </button>
        )}
      </td>
    </tr>
  );
}
