import type { ColonyRow } from "../../lib/db/types.ts";

interface Props {
  colonies: ColonyRow[];
  onSelect: (colonyId: string) => void;
}

// Owner's original design: a list of colonies on open, tapping one opens its map.
// `colonies` is pre-filtered to `verified: true` by App.tsx (see loadVerifiedColonies,
// D-108) — this component never re-checks that, it just renders what it's given.
export function ColonyPicker({ colonies, onSelect }: Props) {
  if (colonies.length === 0) {
    return (
      <div className="colony-picker-overlay">
        <p className="colony-picker-empty">No colonies yet.</p>
      </div>
    );
  }

  return (
    <div className="colony-picker-overlay">
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
