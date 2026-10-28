// docs/plans/40.md, D-053: a colony declares its own status list (colony.json `statuses`), so a
// status is its key string, not a closed union. Which keys are valid for a colony, and which moves
// between them are legal, is decided by lib/colony/colonyStatuses.ts and
// lib/plot-status/transitions.ts; the database guards membership per colony. Split out of types.ts
// (re-exported there, so every existing import keeps working) for invariant 7's 250-line cap.
export type PlotStatus = string;

// One declared status: the key stored on plots.status and plot_history.status, the label shown
// to people, and the map/legend colour (lowercase #rrggbb). Mirrors contract/colony.schema.json.
export interface ColonyStatus {
  key: string;
  label: string;
  colour: string;
}
