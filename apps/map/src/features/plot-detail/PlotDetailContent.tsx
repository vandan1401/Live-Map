import type { PlotDetail } from "../../lib/colony/plotDetail.ts";
import {
  formatDate,
  formatRelativeTime,
  formatRupees,
  formatStatusLabel,
} from "../../shared/format.ts";

// Read-only display of every D-012 field plus the attribution line and history.
// No Save button here — that is M4's job (spec/03's one stated non-goal).
export function PlotDetailContent({ plot, history }: PlotDetail) {
  const attribution = `${formatStatusLabel(plot.status)} — updated by ${
    plot.updated_by
  }, ${formatRelativeTime(plot.updated_at)}`;

  return (
    <div className="plot-detail-content">
      <h2 className="plot-detail-heading">
        {plot.block}-{plot.number}
        {plot.is_corner && <span className="plot-detail-corner-badge">Corner plot</span>}
      </h2>
      <p className="plot-detail-attribution">{attribution}</p>

      <dl className="plot-detail-fields">
        <div>
          <dt>Facing</dt>
          <dd className="plot-detail-facing">{plot.facing.replace("-", " ")}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{plot.area_sqft} sqft</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{plot.owner_name ?? "—"}</dd>
        </div>
        <div>
          <dt>Owner phone</dt>
          <dd>{plot.owner_phone ?? "—"}</dd>
        </div>
        <div>
          <dt>Broker</dt>
          <dd>{plot.broker_name ?? "—"}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>{formatRupees(plot.rate_paise)}</dd>
        </div>
        <div>
          <dt>Booking amount</dt>
          <dd>{formatRupees(plot.booking_amount_paise)}</dd>
        </div>
        <div>
          <dt>Booking date</dt>
          <dd>{formatDate(plot.booking_date)}</dd>
        </div>
        <div>
          <dt>Registry date</dt>
          <dd>{formatDate(plot.registry_date)}</dd>
        </div>
      </dl>

      {plot.notes && <p className="plot-detail-notes">{plot.notes}</p>}

      {history.length > 0 && (
        <div className="plot-detail-history">
          <h3>History</h3>
          <ul>
            {history.map((row) => (
              <li key={row.id}>
                {formatStatusLabel(row.status)} — {row.changed_by},{" "}
                {formatRelativeTime(row.changed_at)}
                {row.note && ` — ${row.note}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
