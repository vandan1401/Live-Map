import publicLinkData from "../../config/publicLink.json";

// Owner ask, 2026-09-10: a per-colony switch for whether the public link shows real plot
// status at all — some colonies are shared before the family wants booking status visible
// to outsiders. Same checked-in-JSON, resolve-by-colonyId shape as mapBackdrop.json/
// mapBackdrops.ts (D-034's precedent) rather than a database column: no migration, no admin
// UI, and this is presentation-only — it never changes what get_public_colony() itself
// returns (PublicColonyView.tsx forces every status to "available" client-side when this is
// false, the same unbooked colour every plot already gets before a sale). Absent entry =
// true, so an un-configured colony's public link behaves exactly as it did before this file
// existed.
export interface PublicLinkConfig {
  showStatus: boolean;
}

const DATA = publicLinkData as Record<string, Partial<PublicLinkConfig>>;

const DEFAULT_SHOW_STATUS = true;

export function resolvePublicLinkShowStatus(colonyId: string | null): boolean {
  if (!colonyId) return DEFAULT_SHOW_STATUS;
  return DATA[colonyId]?.showStatus ?? DEFAULT_SHOW_STATUS;
}
