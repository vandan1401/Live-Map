import type { ColonyRow } from "../../lib/db/types.ts";

interface Props {
  colonies: ColonyRow[];
  onSelect: (colonyId: string) => void;
  // Set only when `colonies` came from the offline cache (docs/plans/07.md, /review
  // finding #3) — cached data must never render without its age, same rule the map's
  // own FreshnessIndicator (M5) enforces for plot statuses.
  freshnessLabel?: string;
}

// Owner's original design: a list of colonies on open, tapping one opens its map.
// `colonies` is pre-filtered to `verified: true` by App.tsx (see loadVerifiedColonies,
// D-108) — this component never re-checks that, it just renders what it's given.
export function ColonyPicker({ colonies, onSelect, freshnessLabel }: Props) {
  if (colonies.length === 0) {
    return (
      <div className="colony-picker-overlay">
        {freshnessLabel && <p className="colony-picker-freshness">{freshnessLabel}</p>}
        <p className="colony-picker-empty">No colonies yet.</p>
      </div>
    );
  }

  return (
    <div className="colony-picker-overlay">
      {freshnessLabel && <p className="colony-picker-freshness">{freshnessLabel}</p>}
      <ul className="colony-picker-list">
        {colonies.map((colony) => (
          <li key={colony.id}>
            <button
              type="button"
              className="colony-picker-item"
              onClick={() => onSelect(colony.id)}
            >
              {colony.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
