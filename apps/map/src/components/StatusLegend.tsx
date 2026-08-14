import { formatStatusLabel } from "../shared/format.ts";
import type { PlotStatus } from "../lib/db/types.ts";

const STATUSES: PlotStatus[] = ["available", "booked", "registered"];

interface Props {
  active: Set<PlotStatus>;
  onToggle: (status: PlotStatus) => void;
  onClear: () => void;
}

// Presentational only — ColonyMap.tsx owns the active-filter state and applies the
// resulting dim/highlight to the map itself (spec/06: "tapping 'Available' dims
// everything else to 20% opacity"). Multi-select, with a clear-all once anything is on.
export function StatusLegend({ active, onToggle, onClear }: Props) {
  return (
    <div className="colony-legend">
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          className={`colony-legend-item colony-legend-${status} ${
            active.has(status) ? "is-active" : ""
          }`}
          aria-pressed={active.has(status)}
          onClick={() => onToggle(status)}
        >
          <span className="colony-legend-swatch" />
          {formatStatusLabel(status)}
        </button>
      ))}
      {active.size > 0 && (
        <button type="button" className="colony-legend-clear" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}
