---
name: review-unstyled-new-components
description: Recurring check — new overlay/screen components in apps/map ship className strings that have no matching CSS rule and no stylesheet import, so the screen renders as unstyled default HTML.
metadata:
  type: feedback
---

For every new component in `apps/map/src/`, grep each `className` literal against
`apps/map/src/styles/*.css` **and** confirm the stylesheet is `@import`ed in
`apps/map/src/index.css`. Tailwind utility classes are fine; bespoke BEM-ish names
(`foo-overlay`, `foo-card`) are the risk.

**Why:** `apps/map` uses Tailwind *plus* one hand-written stylesheet per feature overlay
(`name-prompt.css`, `colony-picker.css`, `plot-detail-sheet.css`, …), each explicitly
imported in `index.css`. Nothing in the toolchain fails when a class has no rule — typecheck,
lint, tests and build all pass, and Claude has no browser, so an entirely unstyled screen
ships green. 2026-08-14 (plan 07, M7): `InstallInstructions.tsx` used
`install-instructions-overlay` / `-card` / `-dismiss`; no such rules existed anywhere and no
new stylesheet was added. That component is the *first screen every user sees* on first open.

**2nd shape, 2026-08-17 (plan 11): the classes existed, the *cascade context* did not.**
`ColonyUploadScreen.tsx` mounts the uploaded `colony.svg` into a new container instead of
reusing `ColonyMap.tsx`'s `parseColonySvg`. The fixture SVG carries no presentation
attributes at all (invariant 1 — verified: zero `fill=`/`stroke=`/`style=` in
`fixtures/shree-vatika-2/colony.svg`), so *every* visible pixel comes from three things the
new mount point silently lacks: the runtime-injected `<defs>` (`.road`/`.garden` are
`fill: url(#texture-road|garden)` → unresolved reference → nothing paints), the Leaflet
world-ground layer beneath (`--colony-plot-stroke` is `#f7f4e8` on the panel's `#ffffff`),
and the DB-driven `data-status` attribute (the only rule that ever gives `.plot` a fill —
`.plot` itself is `fill: none`). **Rule: whenever a diff renders colony SVG anywhere other
than `ColonyMap`, resolve each class against `colony-theme.css` by hand and ask where its
paint comes from — `url(#…)` fills, an ancestor `.colony-svg-root`, a `[data-status]`
attribute, and the layer painted underneath are all invisible in the JSX.**

**3rd shape, 2026-09-08 (plan 28, backdrop): the rule existed, the *stacking order* did
not.** `.public-colony-backdrop-vignette` and `.public-colony-backdrop-attribution` were
added as later siblings of `.colony-map-container` inside `.public-colony-map-wrap` with
`position: absolute; inset: 0` and **no `z-index`**. Leaflet's own CSS puts `z-index: 400`
on `.leaflet-pane` (the map pane) and 600 on the marker pane; neither
`.colony-map-container` (`position: absolute`, `z-index: auto`) nor `.public-colony-map-wrap`
(`position: relative`, flex item, `z-index: auto`) creates a stacking context, so those panes
promote into the same stacking context as the new siblings and paint *above* every
`z-index: auto` element regardless of DOM order. Both new overlays render under the opaque
canvas — the `backdrop-filter` vignette samples the page background instead of the map, and
the ODbL attribution is invisible. **Tell: the two overlays already living in that same wrap
(`.colony-scale-note` z-index 1000, `.colony-compass` 1050) both carry an explicit z-index —
whenever a diff adds an absolutely-positioned overlay next to a Leaflet container, compare
its z-index against its working neighbours' and against `leaflet.css`'s 200/400/500/600/650/
700 pane ladder.**

**4th shape, 2026-09-08 (plan 28, next pass) — the z-index fix for #3 landed and broke a
neighbour that had none.** `.public-colony-backdrop-vignette` now carries `z-index: 900`
(and the attribution `1000`), which fixed the "paints under Leaflet" bug. But
`.public-colony-plot-panel` (`position: fixed`, no `z-index`, `public-colony.css:78-89`) is
the one overlay in that page that *never* had one, and `.public-colony-map-wrap` creates no
stacking context — so the full-viewport `backdrop-filter: blur(7px)` vignette now paints
above the dimensions panel. Harmless in the common flow only because selecting a plot flies
to zoom 3.4, where the vignette's opacity is 0; zoom back out with the panel open and it is
blurred. **Rule: adding a z-index to an overlay re-orders it against every `z-index: auto`
sibling, not just the one it was fixing. After setting one, list every positioned element
that can overlap it and check which ones are still `auto` — in this file every other overlay
is 1000+, so 900 lands in a gap nobody else occupies.** Same family as
[[review-contract-widening-consumers]]: a value's meaning changed for its old readers.

**5th shape, 2026-09-08 (plan 28, next pass again) — fixing #4 occluded the thing #3 was
about.** `.public-colony-plot-panel` got `z-index: 1200` to beat the 900 vignette. That
panel is `position: fixed; left:1rem; right:1rem; bottom:1rem; max-width:22rem; margin:0
auto` — on a ~390px phone it spans nearly the full width and ~150px of height off the
bottom, i.e. exactly where the new `.public-colony-backdrop-attribution` (`bottom:0.5rem;
right:0.5rem`, z-index 1000, no `max-width`, so it wraps to ~2 full-width lines) sits. The
ODbL notice — the one overlay in this diff with a *legal* reason to be visible — is hidden
whenever a visitor taps a plot on a phone. Desktop is fine (the panel is 352px centred),
which is why eyeballing at desktop width misses it. **Rule: a z-index chain that grows three
hops in one diff (900 → 1000 → 1200) means the page has no stacking plan; instead of the
next bump, check the *geometry* — for every `position: fixed` overlay work out its real box
at 390px width, not just its z-index.**

**6th shape, 2026-09-08 (plan 28, next pass again) — moving the overlay to dodge #5 landed
it on a widget the code never mentions because *Leaflet* adds it.** The ODbL attribution was
moved from bottom-right to `top: 0.5rem; left: 0.5rem` and its comment lists the collisions
it checked (`.public-colony-plot-panel`, `.colony-compass`). Neither is at top-left —
`.leaflet-control-zoom` is. `usePublicColonyCanvas.ts`'s `L.map()` sets
`attributionControl: false` but never `zoomControl: false`, and Leaflet 1.9.4's
`Map.mergeOptions({ zoomControl: true })` puts a ~30x60px control at (10,10) inside
`.colony-map-container`, at `z-index: 1000` (`.leaflet-top`). The attribution is a later
sibling at the same 1000, so it paints over the +/- buttons. **Tell: the codebase already
knew — `.colony-freshness-indicator` (colony-theme.css) sits at `left: 0.75rem; top: 3rem`,
3rem down for exactly this reason. Rule: when placing a new overlay in a map corner,
enumerate the occupants that no `className` in the diff names — Leaflet's own zoom control
(top-left by default), attribution control, scale control — not just the app's own divs.
`grep -rn "zoomControl" src/` returning nothing means the control IS there, not that it
isn't.**

**How to apply:** one grep per new component, every review. Related:
[[review-comment-asserts-unimplemented]] (same family: everything that could catch it is
green, so only reading catches it).
