# D-009 — Leaflet `CRS.Simple` as a pan/zoom container only

**Status:** accepted

## Decision

Leaflet runs in `CRS.Simple` mode purely to provide pan, pinch-zoom, and viewport
management. The colony SVG is a plain overlay. Plot paths are **not** routed through
Leaflet's own vector layer.

## Reasoning

`CRS.Simple` gives image-coordinate space with no geographic projection, which is exactly
right for a site plan and costs nothing — no tile server, no map data, no per-request fee,
and it works completely offline.

The restriction matters because Leaflet's vector layer applies **inline styles** to the
paths it manages, and inline styles beat the stylesheet. Routing plots through it would
silently break D-004 in a way that looks like a CSS specificity bug rather than an
architectural mistake.

## Rejected alternatives

- **Google Maps or Mapbox with real coordinates** — needed only for satellite overlay, which
  is explicitly out of scope. Would add per-load cost and break offline use.
- **Leaflet vector layer for plots** — would give hit-testing and popups for free. Rejected
  for the inline-style conflict above.
- **Hand-rolled pan/zoom** — avoids the dependency, but pinch-zoom on mobile Safari has more
  edge cases than it looks like from the outside.

## Blast radius

Low. Swapping the pan/zoom container later does not touch geometry or the theme.
