import { useCallback, useState } from "react";

// MapLoadingScreen.tsx's zoom-in splash (owner ask, 2026-09-10) replays on every colony
// open, including reopening the same colony — openToken bumps on each selection,
// splashDoneToken trails it by exactly one open, set once that open's animation finishes.
// mapZoomToken is the same pattern for the real map's own matching zoom-in (owner ask,
// 2026-09-10 follow-up): it starts false for a fresh open and flips true the moment
// MapLoadingScreen's onZoomStart fires, so the two zooms begin on the same tick rather than
// the map guessing at MapLoadingScreen's internal HOLD_MS timing.
// Split out of App.tsx purely to stay under invariant 7's 250-line cap (same reason
// useOrgName.ts was split out).
//
// finishSplash/startMapZoom are wrapped in useCallback (2026-09-11, live incident) — App.tsx
// passes these straight through as MapLoadingScreen's onFinish/onZoomStart props, which sit
// in that component's own effect dependency arrays. An unmemoized version here is a fresh
// function on every App.tsx render for any reason at all (colony list refetch, freshness
// tick, anything) — a re-render at the wrong moment re-runs those effects, cancelling a
// just-scheduled timer before it fires. useCallback keyed on openToken keeps the identity
// stable for the entire lifetime of one splash cycle (openToken only changes between
// cycles), which is what those effects actually need.
export function useColonyOpenSplash() {
  const [openToken, setOpenToken] = useState(0);
  const [splashDoneToken, setSplashDoneToken] = useState(0);
  const [mapZoomToken, setMapZoomToken] = useState(-1);
  const bumpOpen = useCallback(() => setOpenToken((token) => token + 1), []);
  const finishSplash = useCallback(() => setSplashDoneToken(openToken), [openToken]);
  const startMapZoom = useCallback(() => setMapZoomToken(openToken), [openToken]);
  return {
    openToken,
    showSplash: openToken !== splashDoneToken,
    mapZooming: openToken === mapZoomToken,
    bumpOpen,
    finishSplash,
    startMapZoom,
  };
}
