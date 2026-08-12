import type { PlotStatus } from "../db/types.ts";

// The legal transition table from D-013 (amended 2026-08-12 — registered is not
// terminal). No self-entries: a Save that doesn't change status never reaches this
// layer, it's a UI-level no-op.
const PLOT_TRANSITIONS: Record<PlotStatus, PlotStatus[]> = {
  available: ["booked", "hold"],
  booked: ["registered", "available"],
  hold: ["available"],
  registered: ["available"],
};

export function isLegalTransition(from: PlotStatus, to: PlotStatus): boolean {
  return PLOT_TRANSITIONS[from].includes(to);
}
