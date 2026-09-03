import type { PlotDetail } from "../../lib/colony/plotDetail.ts";
import type { PlotStatus } from "../../lib/db/types.ts";
import {
  formatActorName,
  formatPlotLabel,
  formatRelativeTime,
  formatStatusLabel,
} from "../../shared/format.ts";

type Props = PlotDetail & {
  // Resolved by PlotDetailSheet.tsx from presentation.json (docs/plans/27.md) — omitted
  // falls back to formatStatusLabel's own default text.
  statusLabels?: Partial<Record<PlotStatus, string>>;
};

// Read-only display: dimensions, owner name only while booked (D-012 amended this
// session — narrower than the original D-012 field list), plus the attribution line
// and history (D-006/D-007 — a different question than "what does this plot look
// like," kept regardless of the field-list change).
export function PlotDetailContent({ plot, history, statusLabels }: Props) {
  const attribution = `${formatStatusLabel(plot.status, statusLabels)} — updated by ${formatActorName(
    plot.updated_by,
  )}, ${formatRelativeTime(plot.updated_at)}`;

  return (
    <div className="plot-detail-content">
      <h2 className="plot-detail-heading">
        {formatPlotLabel(plot)}
        {plot.is_corner && <span className="plot-detail-corner-badge">Corner plot</span>}
      </h2>
      <p className="plot-detail-attribution">{attribution}</p>

      <dl className="plot-detail-fields">
        <div>
          <dt>Length</dt>
          <dd>{plot.length_ft} ft</dd>
        </div>
        <div>
          <dt>Breadth</dt>
          <dd>{plot.breadth_ft} ft</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{plot.area_sqft} sq ft</dd>
        </div>
        {plot.status === "booked" && (
          <div>
            <dt>Owner</dt>
            <dd>{plot.owner_name ?? "—"}</dd>
          </div>
        )}
      </dl>

      {history.length > 0 && (
        <div className="plot-detail-history">
          <h3>History</h3>
          <ul>
            {history.map((row) => (
              <li key={row.id}>
                {formatStatusLabel(row.status, statusLabels)} — {formatActorName(row.changed_by)},{" "}
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
