import type { ColonyStatus, PlotStatus } from "../db/types.ts";

// The legal transition rules (D-013, amended 2026-08-12 — registered is not terminal; amended
// again 2026-08-14 — hold removed; amended a third time by docs/plans/40.md, D-053 — a colony
// may declare extra statuses). No self-entries: a Save that doesn't change status never reaches
// this layer, it's a UI-level no-op.
//
// The three BUILT-IN keys keep exactly the table below. Any other key is a CUSTOM status (e.g.
// sold_to_investors) and is "free" within one deliberate limit: it moves to and from
// `available` and between custom statuses, never directly to or from booked/registered —
// `available -> booked` is the one place a buyer name is collected (D-018), so a direct edge into
// booked would bypass it, and registered is only reachable through booked.
const BUILT_IN_TRANSITIONS: Record<string, readonly string[]> = {
  available: ["booked"],
  booked: ["registered", "available"],
  registered: ["available"],
};

function isBuiltIn(key: string): boolean {
  return Object.hasOwn(BUILT_IN_TRANSITIONS, key);
}

// `statuses`, when given, is the colony's declared list: a move to or from a key the colony
// does not list is never legal. Omitted = no colony context (the built-in rules alone).
export function isLegalTransition(
  from: PlotStatus,
  to: PlotStatus,
  statuses?: readonly { key: string }[],
): boolean {
  if (from === to) return false;
  if (statuses && !(statuses.some((s) => s.key === from) && statuses.some((s) => s.key === to))) {
    return false;
  }
  const fromBuiltIn = isBuiltIn(from);
  const toBuiltIn = isBuiltIn(to);
  if (fromBuiltIn && toBuiltIn) return BUILT_IN_TRANSITIONS[from].includes(to);
  if (!fromBuiltIn && !toBuiltIn) return true;
  // One side custom, one built-in: only through `available`.
  return fromBuiltIn ? from === "available" : to === "available";
}

// The statuses a plot currently in `from` may move to, in the colony's legend order.
export function legalNextStatuses(from: PlotStatus, statuses: readonly ColonyStatus[]): ColonyStatus[] {
  return statuses.filter((s) => isLegalTransition(from, s.key, statuses));
}
