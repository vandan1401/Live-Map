import type { ColonyStatus } from "../db/types.ts";

// docs/plans/40.md, D-053: a colony declares its own status list in colony.json. This module is
// the one place that decides what that list is for a given colony and what each entry looks
// like — every consumer (legend, detail sheet, table, share summary, map theme, public view)
// reads the output of resolveColonyStatuses(), never its own hardcoded triple.

// The keys with built-in rules (transitions.ts): available is where every plot starts, booked
// needs a buyer name, registered is the executed sale deed. Re-labelling or re-colouring them is
// presentation; the rules attach to the KEY.
export const DEFAULT_STATUS_KEYS = ["available", "booked", "registered"] as const;

// Why 8: the legend/toolbar is one row on a phone, and past roughly eight colours the map stops
// being readable at a glance. Mirrored by contract/colony.schema.json (maxItems), the pipeline's
// QA, and the database's valid_colony_statuses() — change all four together or none.
export const MAX_STATUSES = 8;

// The slice of presentation.json this module needs — resolvePresentationConfig()'s statusLabels
// and statusColors, already merged default + per-colony override (docs/plans/27.md).
export interface PresentationStatusConfig {
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
}

// Precedence (highest first): the colony's own declared list > presentation.json's per-colony
// override > the default. A declared entry always carries its own label and colour (the schema
// requires both), so presentation.json only ever matters for a colony that declares nothing —
// exactly the colonies that exist today, which therefore render byte-for-byte as before.
export function resolveColonyStatuses(
  declared: readonly ColonyStatus[] | null | undefined,
  presentation: PresentationStatusConfig,
): ColonyStatus[] {
  if (declared && declared.length > 0) return declared.map((s) => ({ ...s }));
  return DEFAULT_STATUS_KEYS.map((key) => ({
    key,
    label: presentation.statusLabels[key],
    colour: presentation.statusColors[key],
  }));
}

export function statusLabelMap(statuses: readonly ColonyStatus[]): Record<string, string> {
  return Object.fromEntries(statuses.map((s) => [s.key, s.label]));
}

export function statusColourMap(statuses: readonly ColonyStatus[]): Record<string, string> {
  return Object.fromEntries(statuses.map((s) => [s.key, s.colour]));
}

// JSON Schema cannot express "no two entries share a key", so the upload screen checks it here
// after the schema passes.
export function findDuplicateStatusKeys(statuses: readonly ColonyStatus[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { key } of statuses) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}
