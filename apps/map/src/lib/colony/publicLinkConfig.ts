import publicLinkData from "../../config/publicLink.json";

// Owner ask, 2026-09-10 (redesigned same day from the first cut — see PROGRESS.md): whether
// a colony's public link offers a live status-visibility toggle at all. Same checked-in-
// JSON, resolve-by-colonyId shape as mapBackdrop.json/mapBackdrops.ts (D-034's precedent)
// rather than a database column — no migration, no admin UI.
//
// Absent entry / statusToggle: false -> PublicColonyView.tsx renders no toggle button and
// every plot always shows "available" (applyStatusVisibility, shared/), with no way for a
// visitor to reveal real status. statusToggle: true -> a toggle button appears, defaulting
// OFF (same "available" rendering) until the visitor turns it on themselves — real status
// is never shown on first load either way, the difference is only whether a visitor *can*
// reveal it during their own visit. This never changes what get_public_colony() itself
// returns (client-side only, owner's own choice, confirmed via AskUserQuestion — see
// PROGRESS.md for the server-side alternative if that trade-off changes later).
export interface PublicLinkConfig {
  statusToggle: boolean;
}

const DATA = publicLinkData as Record<string, Partial<PublicLinkConfig>>;

const DEFAULT_STATUS_TOGGLE = false;

export function resolvePublicLinkStatusToggle(colonyId: string | null): boolean {
  if (!colonyId) return DEFAULT_STATUS_TOGGLE;
  return DATA[colonyId]?.statusToggle ?? DEFAULT_STATUS_TOGGLE;
}
