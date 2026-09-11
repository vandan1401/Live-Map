// Shared between MapLoadingScreen.tsx's own zoom-out and the real map's matching zoom-in
// (ColonyMap.tsx, PublicColonyView.tsx) — owner ask, 2026-09-10: the real map underneath
// should visibly zoom in at the same pace as the loading screen zooms out, landing on its
// normal view exactly as the loading screen finishes revealing it. Both sides read these
// same numbers rather than each hardcoding its own copy, so there's exactly one place to
// retune the pace and no way for the two to drift apart.
export const MAP_OPEN_HOLD_MS = 2000; // fully still, needle dissolving open — owner ask, 2s
export const MAP_OPEN_ZOOM_MS = 4500; // the zoom itself — owner ask, slower than the first cut
// Tuned interactively (owner, 2026-09-11) in the Zoom Splash Lab artifact linked from that
// session. Two earlier tries both read wrong on replay and are worth remembering as failure
// modes, not just discarded numbers: (1) a control point's y below 1 (e.g. ...0.867, 0.582)
// makes the curve dip then whip up to (1,1), so the zoom visibly speeds up right at the end
// — the opposite of "slower as it finishes". (2) pushing both control points' x near 0 (e.g.
// 0.08, 0.85, 0.1, 1, "more ease-out") doesn't spread the deceleration out — it crams ~80%
// of the zoom into the first ~20% of MAP_OPEN_ZOOM_MS and leaves the rest essentially frozen,
// which reads as *faster*, not slower, because there's no visible motion left to be slow.
// This curve keeps both control points off the axes (x1=0.33, x2=0.6) and y1<=y2<1
// (monotonic, no dip) so the back third of the zoom still has real, visible motion.
//
// Exported as the raw 4 numbers, not just a CSS string, since 2026-09-11: the real map's
// zoom-in moved from a CSS transform to a JS-side cubic-bezier evaluated per frame — the
// consumer needs the numbers, not a string meant for `transition-timing-function`. That
// consumer was canvasFlyTo.ts's runOpenZoom (2026-09-11) until 2026-09-12, when it moved
// again to canvasOpenZoomSnapshot.ts's runOpenZoomSnapshot (own file — a frozen-destination-
// snapshot technique, not the live-redraw-every-frame one canvasFlyTo.ts's runFlyTo still
// uses for click-to-focus) — same easing curve either way, only the mechanism changed.
// MAP_OPEN_ZOOM_EASE (the CSS string) stays derived from the same numbers, still used by
// MapLoadingScreen.tsx's own splash overlay animation, a real CSS transition unaffected by
// either change — only what happens to the *map underneath* the splash has ever moved.
export const MAP_OPEN_ZOOM_EASE_POINTS: [number, number, number, number] = [0.33, 0.6, 0.6, 0.9];
export const MAP_OPEN_ZOOM_EASE = `cubic-bezier(${MAP_OPEN_ZOOM_EASE_POINTS.join(", ")})`;
