# D-110 — Normalise to viewBox width 1000 with a Y-axis flip

**Status:** accepted

## Decision

At export: translate so min x,y is zero, flip the Y axis, scale to viewBox width 1000,
height following the aspect ratio. Store the transform matrix so real-world coordinates can
be recovered.

## Reasoning

CAD and PDF coordinate systems count Y **upward**; SVG counts Y **downward**. Skipping the
flip renders every plan mirrored — and mirrored looks entirely plausible, because all the
plots are present and all the roads connect. It is the kind of bug that ships.

A fixed viewBox width means the app never needs per-colony magic numbers, and CSS stroke
widths and font sizes behave consistently across colonies of very different real-world
dimensions. Keeping the transform means the normalisation is not lossy: real-world
coordinates remain recoverable if a future feature needs them.

## Rejected alternatives

- **Preserve source coordinates** — honest, and forces every consumer to handle wildly
  different coordinate ranges and unit systems.
- **Normalise to a unit square** — clean mathematically, and produces sub-pixel stroke
  widths and unreadable font sizing in the app.

## Blast radius

High and quiet. Gets its own test rather than a visual glance, precisely because a mirrored
plan does not look wrong.
