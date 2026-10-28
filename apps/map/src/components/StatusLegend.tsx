import type { ColonyStatus, PlotStatus } from "../lib/db/types.ts";

interface Props {
  active: Set<PlotStatus>;
  onToggle: (status: PlotStatus) => void;
  onClear: () => void;
  // docs/plans/40.md: this colony's status list, in legend order — the label and the swatch
  // colour both come from it, so a colony's own statuses need no stylesheet change.
  statuses: readonly ColonyStatus[];
}

// Presentational only — ColonyMap.tsx owns the active-filter state and applies the
// resulting dim/highlight to the map itself (spec/06: "tapping 'Available' dims
// everything else to 20% opacity"). Multi-select, with a clear-all once anything is on.
export function StatusLegend({ active, onToggle, onClear, statuses }: Props) {
  return (
    <div className="colony-legend">
      {statuses.map(({ key, label, colour }) => (
        <button
          key={key}
          type="button"
          className={`colony-legend-item colony-legend-${key} ${
            active.has(key) ? "is-active" : ""
          }`}
          aria-pressed={active.has(key)}
          onClick={() => onToggle(key)}
        >
          <span className="colony-legend-swatch" style={{ background: colour }} />
          {label}
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
