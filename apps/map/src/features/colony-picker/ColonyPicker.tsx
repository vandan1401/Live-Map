import type { ColonyRow } from "../../lib/db/types.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";
import { ShareLinkButton } from "./ShareLinkButton.tsx";

// No colonyId — this screen renders before any colony is selected, so it only ever reads
// the default block (docs/plans/27.md). Used only as a fallback below, for the brief
// loading window before App.tsx's organization fetch resolves, or if that fetch fails.
const { homeHeading: DEFAULT_HEADING } = resolvePresentationConfig();

interface Props {
  colonies: ColonyRow[];
  // The signed-in group's real name, fetched from the `organizations` table (owner ask:
  // each group's home screen must show what's set for it in the admin portal, not one
  // config value every group used to share). Null while App.tsx's fetch is still pending
  // or failed — falls back to DEFAULT_HEADING rather than showing nothing.
  orgName: string | null;
  onSelect: (colonyId: string) => void;
  // Set only when `colonies` came from the offline cache (docs/plans/07.md, /review
  // finding #3) — cached data must never render without its age, same rule the map's
  // own FreshnessIndicator (M5) enforces for plot statuses.
  freshnessLabel?: string;
  // Opens ColonyUploadScreen (docs/plans/11.md, D-025) — every signed-in family member is
  // an equal admin (D-007), so no role gating here.
  onUpload: () => void;
  // Signs the current session out (owner ask, 2026-08-25: there was no way to switch
  // accounts on a shared device once signed in — App.tsx's signOut() was reachable only
  // from its own internal stale/invalid-session cases, never from a button).
  onLogout: () => void;
}

// Owner's original design: a list of colonies on open, tapping one opens its map.
// `colonies` is pre-filtered to `verified: true` by App.tsx (see loadVerifiedColonies,
// D-108) — this component never re-checks that, it just renders what it's given.
export function ColonyPicker({ colonies, orgName, onSelect, freshnessLabel, onUpload, onLogout }: Props) {
  const heading = orgName ?? DEFAULT_HEADING;

  if (colonies.length === 0) {
    return (
      <div className="colony-picker-overlay">
        <button type="button" className="colony-picker-logout" onClick={onLogout}>
          Log out
        </button>
        <h1 className="colony-picker-heading">{heading}</h1>
        {freshnessLabel && <p className="colony-picker-freshness">{freshnessLabel}</p>}
        <p className="colony-picker-empty">No colonies yet.</p>
        <button type="button" className="colony-picker-upload" onClick={onUpload}>
          Upload a colony
        </button>
      </div>
    );
  }

  return (
    <div className="colony-picker-overlay">
      <button type="button" className="colony-picker-logout" onClick={onLogout}>
        Log out
      </button>
      <h1 className="colony-picker-heading">{heading}</h1>
      {freshnessLabel && <p className="colony-picker-freshness">{freshnessLabel}</p>}
      <ul className="colony-picker-list">
        {colonies.map((colony) => (
          <li key={colony.id} className="colony-picker-row">
            <button
              type="button"
              className="colony-picker-item"
              onClick={() => onSelect(colony.id)}
            >
              {colony.name}
            </button>
            <ShareLinkButton token={colony.public_token} />
          </li>
        ))}
      </ul>
      <button type="button" className="colony-picker-upload" onClick={onUpload}>
        Upload a colony
      </button>
    </div>
  );
}
