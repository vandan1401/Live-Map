// MapLoadingScreen.tsx's own splash-overlay pace (owner ask, 2026-09-10). The real map
// underneath never moves during any of this (owner ask, 2026-09-12, after three tried-and-
// reverted map-side zoom mechanisms in one day — D-041's real-camera-every-frame engine,
// D-042's frozen-destination-snapshot CSS overlay, D-043's native-Leaflet animated zoom):
// it renders its actual final view from the very first frame and just sits there, still,
// hidden and then revealed by the splash's own animation. These constants govern only that
// splash animation now, not anything about the map.
export const MAP_OPEN_HOLD_MS = 2000; // fully still, needle dissolving open — owner ask, 2s
export const MAP_OPEN_ZOOM_MS = 4500; // the splash's own zoom-out — owner ask, slower than the first cut
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
export const MAP_OPEN_ZOOM_EASE_POINTS: [number, number, number, number] = [0.33, 0.6, 0.6, 0.9];
export const MAP_OPEN_ZOOM_EASE = `cubic-bezier(${MAP_OPEN_ZOOM_EASE_POINTS.join(", ")})`;
