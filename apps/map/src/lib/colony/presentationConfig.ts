import presentationData from "../../config/presentation.json";
import type { PlotStatus } from "../db/types.ts";

// docs/plans/27.md: home heading, per-colony no-owner import tokens, status display
// names/colours, and the dimension-callout spacing/text template are all read from one
// checked-in JSON file rather than hardcoded — Tier 2/3 presentation config, deliberately
// not a database table (no migration, no admin UI needed for a 5-6 user family app).
export interface PresentationConfig {
  homeHeading: string;
  noOwnerTokens: string[];
  statusLabels: Record<PlotStatus, string>;
  statusColors: Record<PlotStatus, string>;
  dimension: { offset: number; textFormat: string };
}

interface PresentationData {
  default: PresentationConfig;
  colonies: Record<string, Partial<PresentationConfig>>;
}

const data = presentationData as PresentationData;

// Shallow per-key override only (plan §2.1) — a colony overriding one status colour must
// repeat all three; no recursive merge to keep this a single object spread.
export function resolvePresentationConfig(colonyId?: string): PresentationConfig {
  const override = colonyId ? data.colonies[colonyId] : undefined;
  return { ...data.default, ...override };
}
