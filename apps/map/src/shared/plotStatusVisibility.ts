// Owner ask, 2026-09-10: a status toggle exists on both the admin map (ColonyMap.tsx,
// StatusToggle.tsx) and the public link (PublicColonyView.tsx) — when off, every plot
// must render the same "available" colour it would show before any sale, regardless of
// its real status. One pure function so both call sites (and the layer between them,
// useColonyCanvas.ts's pushState) apply exactly the same substitution rather than each
// re-deriving "available" as a literal.
export function applyStatusVisibility(
  statuses: Readonly<Record<string, string>>,
  visible: boolean,
): Record<string, string> {
  if (visible) return statuses as Record<string, string>;
  const hidden: Record<string, string> = {};
  for (const svgId of Object.keys(statuses)) hidden[svgId] = "available";
  return hidden;
}
