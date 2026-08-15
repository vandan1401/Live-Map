# D-022 — Ground texture is a mirror-tiled real photo, rendered as a second Leaflet SVG overlay

**Status:** accepted

## Decision

The map's ground/garden texture is a real, owner-supplied AI-generated grass photo
(`apps/map/src/assets/textures/grass-satellite.jpg`), made tileable by mirroring it into
a 2x2 block (`mapTexturePatterns.ts`'s `buildMirroredPhotoPattern`), and painted across
the whole visible world — not just the site's own bounds — via a *second* Leaflet
`svgOverlay` (`buildWorldGroundSvg`) added beneath the site's own overlay, sharing the
same map coordinate transform. Roads get a small procedural fleck pattern
(`buildRoadPatternDefs`), not a photo — status readability (tier-3.md) matters more there
than texture fidelity, and a flat muted fill with a little grain was enough.

## Reasoning

The owner's own words drove every constraint here: "make it feel like everything is
getting zoomed in, not just the rectangle" ruled out a CSS `background-image` on the map
container (can't scale with Leaflet's zoom); "not every strand will be visible... from
satellite it will look like some texture" set the fidelity bar (soft/blurred is correct,
not a defect); "atleast change how the grass looks... get a seamless image" is what
actually got the source swapped from two rejected procedural attempts to a real photo.
Mirroring guarantees a seamless tile regardless of whether the source photo itself tiles
cleanly — the owner said they weren't sure — at the cost of a symmetric "kaleidoscope"
repeat, judged acceptable at ground-texture scale once the tile size and blur were tuned
to make the repeat unobtrusive (`PROGRESS.md`'s part-5 log). A second `svgOverlay` (not
padding the site SVG's own `viewBox`) was chosen specifically to avoid touching a value
`useSelectedPlotOverlay.ts` reads directly for pan-to-selection math — this repo already
has one documented incident from a viewBox/bounds mismatch breaking that exact code path.

## Rejected alternatives

- **Procedural texture (blade strokes, then translucent blobs)** — rejected twice by the
  owner directly ("worst boring grass i have ever seen"). Both read as mechanical/
  repeating at any zoom level a real photo's noise does not.
- **CSS `background-image` on `.colony-map-container`** — the part-3 approach. Covered the
  full viewport but is fixed relative to the container, not the map's coordinate system,
  so it visibly desynced from the site during zoom. Replaced in part 4.
- **An actual satellite/drone photo** — not available: this is an offline-capable PWA with
  no external asset/CDN dependency and no image-generation tool in this environment: the
  owner's own AI-generated photo, which they gave explicit permission to use, was the
  closest available substitute.
- **A genuinely random (non-mirrored) tiling** — would need either a much larger seamless
  source image or per-tile content variation, neither of which a single SVG `<pattern>`
  repeat can express; out of scope for what a single supplied photo can produce.

## Blast radius

Low-medium. Touches only `apps/map/src/components/{ColonyMap,mapTexturePatterns,
mapLabelChips}.ts` and the texture/theme CSS files — no schema, contract, or pipeline
change. The photo asset itself is swappable without any other code change (same file
path); a future colony with a different palette would only need a new photo, not a new
mechanism. If mirroring's kaleidoscope repeat is ever judged unacceptable, replacing it
requires either a genuinely seamless source photo or a different tiling technique — not a
one-line fix.
