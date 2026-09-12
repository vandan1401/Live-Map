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
// Exported as the raw 4 numbers, not just a CSS string, since 2026-09-11 — kept that way for
// MapLoadingScreen.tsx's own splash overlay, still a real CSS `transition-timing-function`
// on that component's zoom-out. The real map's own zoom-in underneath went through two
// mechanisms since: a JS-side per-frame camera interpolation evaluating this same curve
// (2026-09-11, `canvasFlyTo.ts::runOpenZoom` — reverted, D-043, real but not free: a full
// drawColony() on every one of ~270 frames over 4.5s), then a frozen-destination-snapshot
// CSS transform (2026-09-12, D-042 — reverted same day after a real bug on the owner's own
// device). colonyCanvasLayer.ts's openZoomTo now drives Leaflet's OWN native animated
// `setView` instead (D-043) — the same CSS-pane-transition-plus-one-real-redraw mechanism
// every ordinary scroll-wheel/double-click zoom on this map already uses, so there is no
// third custom engine to get wrong. Leaflet's own easing is a single easeLinearity number,
// not a 4-point bezier, so MAP_OPEN_ZOOM_EASE_POINTS' exact curve cannot be reproduced
// precisely — MAP_OPEN_ZOOM_EASE_LINEARITY below is a fresh approximation, not a conversion,
// and needs the owner's own eyes on a real device to retune (Claude cannot watch
// requestAnimationFrame-driven or CSS-transition motion from this environment).
export const MAP_OPEN_ZOOM_EASE_POINTS: [number, number, number, number] = [0.33, 0.6, 0.6, 0.9];
export const MAP_OPEN_ZOOM_EASE = `cubic-bezier(${MAP_OPEN_ZOOM_EASE_POINTS.join(", ")})`;
export const MAP_OPEN_ZOOM_DURATION_S = MAP_OPEN_ZOOM_MS / 1000; // Leaflet's setView takes seconds
// Leaflet's own zoom-easing knob (0 = most curved/decelerated, 1 = linear, its own default
// zoom feel is 0.25) — lower than default for the same "slower as it finishes" the owner
// tuned MAP_OPEN_ZOOM_EASE_POINTS for, not yet verified against a real device.
export const MAP_OPEN_ZOOM_EASE_LINEARITY = 0.2;
