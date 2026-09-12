import { useCallback, useState } from "react";

// MapLoadingScreen.tsx's zoom-in splash (owner ask, 2026-09-10) replays on every colony
// open, including reopening the same colony — openToken bumps on each selection,
// splashDoneToken trails it by exactly one open, set once that open's animation finishes.
// Split out of App.tsx purely to stay under invariant 7's 250-line cap (same reason
// useOrgName.ts was split out).
//
// The map underneath never moves during any of this (owner ask, 2026-09-12: three attempts
// at a matching map-side zoom-in were each tried and reverted the same day — D-041/D-042/D-043
// — before the owner decided the map should just already be sitting at its real final view,
// unanimated, the whole time). This hook only owns the splash's own show/hide lifecycle now.
//
// finishSplash is wrapped in useCallback (2026-09-11, live incident) — App.tsx passes it
// straight through as MapLoadingScreen's onFinish prop, which sits in that component's own
// effect dependency array. An unmemoized version here is a fresh function on every App.tsx
// render for any reason at all (colony list refetch, freshness tick, anything) — a re-render
// at the wrong moment re-runs that effect, cancelling a just-scheduled timer before it fires.
// useCallback keyed on openToken keeps the identity stable for the entire lifetime of one
// splash cycle (openToken only changes between cycles), which is what that effect needs.
export function useColonyOpenSplash() {
  const [openToken, setOpenToken] = useState(0);
  const [splashDoneToken, setSplashDoneToken] = useState(0);
  const bumpOpen = useCallback(() => setOpenToken((token) => token + 1), []);
  const finishSplash = useCallback(() => setSplashDoneToken(openToken), [openToken]);
  return {
    openToken,
    showSplash: openToken !== splashDoneToken,
    bumpOpen,
    finishSplash,
  };
}
