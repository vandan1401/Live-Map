# D-027 — The map is a canvas layer, not an SVG overlay

**Accepted, 2026-08-22.** Amends D-022's mechanism. **Upholds D-009.**

## What changed

`apps/map` drew the colony by handing Leaflet two `L.svgOverlay`s: the site's own SVG and a
larger "world ground" one behind it. Both are gone. The colony is now parsed into a plain
draw model and painted to a single `<canvas>` that lives in a custom `L.Layer` and is sized
to the **viewport**, never to the colony.

## Why

Measured, not assumed (full matrices in `PROGRESS.md`, 2026-08-22):

| | Before | After |
|---|---|---|
| Zoom, as shipped | 6 fps | 60 fps animated / 40 fps discrete steps |
| Pan | 60 fps | 60 fps |
| Cost per zoom step | 198–237 ms | ~17 ms worst case |

The cause was never data volume — the whole colony is 6,433 vertices. `L.svgOverlay` sets a
pixel width and height on its element every zoom step, and at zoom 4 that element was
16,000 px wide with the world layer at 64,000 px. The browser re-laid-out thousands of nodes
across that surface, once per step, and `zoomSnap: 0.1` made a single gesture pay it ten
times. A canvas pinned to the window is a few hundred pixels forever; only its contents
change.

Two things were tried and rejected **on measurement**, and are recorded so they are not
retried: hiding off-screen plots with `display:none` made zoom *worse* (260–438 ms/step —
the browser already clips, and the style recalc still walks every node), and batching plot
fills by status saved 0.0 ms while changing how overlapping rings composite.

## Why Leaflet stays

Hosting the canvas inside Leaflet costs ~8 ms on the synthetic discrete-step path and
nothing on the two paths a real gesture produces. In exchange, pinch, drag and inertia stay
Leaflet's — already hardened on mobile Safari, which is the target device and the riskiest
thing here to hand-roll.

So D-009 is not superseded; it is more literally true than before. Leaflet manages pan and
zoom on the container and never touches a plot. What changed is only the kind of thing it
is given to move.

SVG space is bound to Leaflet as **lat = −y, lng = x**, which makes `L.CRS.Simple`'s
`(lng, −lat)` projection the identity and leaves no coordinate flip to get wrong. The one
place that binding is written down is `view.ts`'s `colonyLatLngBounds`/`leafletViewState`,
and it is tested — a mirrored colony looks entirely plausible and has cost this codebase a
real bug before.

## What this costs

- **D-004 changes mechanism, not meaning.** Colours can no longer be applied by CSS
  selectors, so `components/map/colonyTheme.ts` reads every `--colony-*` custom property
  from `styles/colony-theme.css` at runtime. That file is still the one place a colour
  changes. An unresolvable variable renders magenta rather than a plausible grey.
- **The 400 ms status fade is hand-driven now** (`statusTransitions.ts`) instead of one line
  of CSS. A bulk load still registers no transitions.
- **The map is opaque to DevTools and to screen readers.** `PlotTableView` is the accessible
  path and already exists. The dev click badge now also reports orphaned plot rows, which
  the SVG renderer failed at in total silence.
- **`contract/` does not move.** The pipeline emits the same SVG; the app parses it into
  `Path2D` instead of DOM nodes.

## Rejected alternatives

**`L.canvas()` with the plots as `L.polygon` layers.** The obvious suggestion, and the one
generic Leaflet performance advice gives. It fixes the wrong half: Leaflet's canvas renderer
has no text primitive, and labels are 55% of a frame. The 675 plot numbers would have had to
become DOM tooltips, reintroducing exactly the cost being escaped, worse.

**A raster proxy / static snapshot** — draw a bitmap, transform it during the gesture, swap
back to vectors on settle. Measured: the proxy does hold 60 fps, but a snapshot costs
108–143 ms, about the same as the settle it avoids, and Leaflet's own animated zoom already
achieved 57–60 fps without one. It also goes blurry when zoomed into, which a 17 ms live
redraw does not.

**Viewport culling in the DOM** (`display: none` on off-screen plots). Made zoom *worse* —
260–438 ms/step against 198–237 unculled. The browser already clips off-screen content, so
nothing is saved on raster, while the style recalc still walks every node. Recorded because
it is an intuitive idea that will otherwise be retried.

**Batching plot fills by status** (3 fills instead of 675). Worth exactly 0.0 ms — the cost
is pixels rasterised, not draw calls issued — and it changes output: one 0.38 tint across
the union instead of per plot, so overlapping rings render lighter. Rejected on both counts.

**Dropping Leaflet entirely and hand-rolling gestures.** A standalone canvas measures ~58 fps
on the discrete-step path against 40 fps hosted, so this is the faster option on paper. Not
taken: the ~8 ms buys pinch, drag, inertia and their mobile-Safari quirks already hardened,
on the one device class this app exists for, and the two paths a real finger produces are
60 fps either way.

**Simplifying geometry (TopoJSON, Mapshaper, vector tiles).** Standard advice for slow
Leaflet maps, inapplicable here: the whole colony is 6,433 vertices. Geometry was never the
bottleneck and simplifying it would buy nothing measurable.
