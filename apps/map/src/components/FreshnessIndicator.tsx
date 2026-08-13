interface Props {
  label: string;
  offline: boolean;
}

// Presentational only — ColonyMap.tsx owns the subscription, the tick, and the
// online/offline derivation. No state, no effects here.
export function FreshnessIndicator({ label, offline }: Props) {
  return (
    <p className={`colony-freshness-indicator ${offline ? "is-offline" : ""}`}>{label}</p>
  );
}
