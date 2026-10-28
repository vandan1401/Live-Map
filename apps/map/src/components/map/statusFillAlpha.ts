// Split out of drawColony.ts (2026-09-14) so the WhatsApp/social-preview Worker
// (apps/map/worker/renderOgSvg.ts) can reuse the exact same status-tint strength without
// importing drawColony.ts's own DOM-typed canvas code into a Worker that has no DOM lib.
//
// Owner, 2026-08-22: superseded 0.38 (itself tuned 2026-08-16 against the old grass-
// texture-showing-through design). Every plot paints an opaque --colony-plot-base first, so
// this alpha only controls how much of that base shows through the status hue, not how much
// of the world ground does — the owner's reference renders show a flat, near-opaque status
// colour.
export const STATUS_FILL_ALPHA = 0.88;
