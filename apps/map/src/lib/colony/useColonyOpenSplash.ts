import { useState } from "react";

// MapLoadingScreen.tsx's zoom-in splash (owner ask, 2026-09-10) replays on every colony
// open, including reopening the same colony — openToken bumps on each selection,
// splashDoneToken trails it by exactly one open, set once that open's animation finishes.
// mapZoomToken is the same pattern for the real map's own matching zoom-in (owner ask,
// 2026-09-10 follow-up): it starts false for a fresh open and flips true the moment
// MapLoadingScreen's onZoomStart fires, so the two zooms begin on the same tick rather than
// the map guessing at MapLoadingScreen's internal HOLD_MS timing.
// Split out of App.tsx purely to stay under invariant 7's 250-line cap (same reason
// useOrgName.ts was split out).
export function useColonyOpenSplash() {
  const [openToken, setOpenToken] = useState(0);
  const [splashDoneToken, setSplashDoneToken] = useState(0);
  const [mapZoomToken, setMapZoomToken] = useState(-1);
  return {
    openToken,
    showSplash: openToken !== splashDoneToken,
    mapZooming: openToken === mapZoomToken,
    bumpOpen: () => setOpenToken((token) => token + 1),
    finishSplash: () => setSplashDoneToken(openToken),
    startMapZoom: () => setMapZoomToken(openToken),
  };
}
