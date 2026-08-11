# D-004 — Colony SVGs carry geometry only, never styling

**Status:** accepted

## Decision

Generated colony SVGs contain `class`, `id`, and `data-*` attributes and nothing else. No
`fill`, no `stroke`, no `style`. All appearance comes from one stylesheet; status is applied
at runtime by setting `data-status` on each `.plot` node.

## Reasoning

Two payoffs, and the second is the one that matters.

First, status colour is not in the SVG file at all, so a plot selling does not require
regenerating geometry. The file is written once and never touched again.

Second, the theme and the geometry become independent projects. The look can be redesigned
six months from now — new palette, thicker roads, different tree style — and **every colony
updates at once** without a single SVG being touched. That is only true if the discipline
holds absolutely; one hardcoded fill and the guarantee is gone.

The CSS transition on `fill` also makes the M5 realtime colour change free.

## Rejected alternatives

- **Styling baked into the SVG at generation time** — simpler generator, and each file
  looks right standalone. Rejected: every theme change would mean regenerating every colony,
  and status changes would mean rewriting files.
- **Inline styles set by JavaScript** — works, but defeats the stylesheet and makes the
  theme unreadable as a single artifact.

## Blast radius

Very high — this is a contract between two separate projects. The pipeline tool promises to
emit this shape; this app promises to consume it. Changing it breaks both.

## Consequence for Leaflet

See D-009. Leaflet's vector layer writes inline styles, which beat the stylesheet. That is
why the SVG is a plain overlay rather than a Leaflet layer.
