import type { ColonyStatus, PlotStatus } from "../db/types.ts";

// The legal transition rules (D-013, amended 2026-08-12 — registered is not terminal; amended
// again 2026-08-14 — hold removed; amended a third time by docs/plans/40.md, D-053 — a colony
// may declare extra statuses). No self-entries: a Save that doesn't change status never reaches
// this layer, it's a UI-level no-op.
//
// The three BUILT-IN keys keep exactly the table below. Any other key is a CUSTOM status (e.g.
// sold_to_investors) and is free: it moves to and from every status the colony lists, built-in or
// custom (docs/plans/41.md, D-054 — this lifts docs/plans/40.md's "only through available" limit).
// A move into or out of a custom status never sends a buyer name, so `owner_name` stays the one the
// plot was booked for (D-018); the buyer-name prompt belongs to a fresh `available -> booked` only.
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
  if (isBuiltIn(from) && isBuiltIn(to)) return BUILT_IN_TRANSITIONS[from].includes(to);
  // One side custom, one built-in (or both custom): free.
  return true;
}

// The statuses a plot currently in `from` may move to, in the colony's legend order.
export function legalNextStatuses(from: PlotStatus, statuses: readonly ColonyStatus[]): ColonyStatus[] {
  return statuses.filter((s) => isLegalTransition(from, s.key, statuses));
}
