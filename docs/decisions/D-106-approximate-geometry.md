# D-106 — Approximate geometry accepted; topology must be exact

**Status:** accepted

## Decision

Plot boundaries need not match the surveyed drawing exactly.
`minimum_rotated_rectangle` is the default simplification, with a `keep_shape` flag for
genuinely irregular plots. What must be exact is **relative position and topology**.

## Reasoning

Every plot's real details are one tap away in the app, so a boundary off by 40cm changes
nothing anyone will ever notice. Colony plots are close to rectangular anyway, so the visual
difference from an oriented bounding box is negligible — and the simplification *rescues*
messy input, because a slightly broken polygon still yields a sane rectangle.

What must not drift:

- **Which side of a road a plot is on.** A map that puts A-14 in the wrong block is worse
  than no map.
- **Facing.** East and north-facing plots carry a price premium in Indian plot sales.
  Never mirror or rotate the plan for visual convenience, and always mark north.
- **Corner status.** Also a premium attribute; a corner plot must visibly read as a corner.
- **Relative size.** A 2,400 sq ft plot rendering the same size as a 1,200 sq ft one
  misleads.

Every export carries "Indicative layout — not to scale". It costs nothing and it is the line
that matters if someone ever argues boundaries from a screenshot.

## Rejected alternatives

- **Survey-grade fidelity** — would force the DXF path and block on file availability, for
  precision nobody uses.
- **Pure grid abstraction** (airline-seat-map style) — fastest of all, but the family would
  not recognise it as their colony, and recognition is what makes the tool trusted.

## Blast radius

Low, and reversible per colony: a premium project needing exact geometry can be run through
a stricter path and dropped in, since the output contract is unchanged.
