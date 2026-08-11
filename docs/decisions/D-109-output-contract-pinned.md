# D-109 — The output contract is pinned and shared

**Status:** accepted

## Decision

The SVG class vocabulary, `data-kind` values, id format, and manifest schema in
`spec/00-rules.md` are a fixed interface with `colony-map` (its D-004 and D-005).

## Reasoning

Fixing this contract early is what lets the two projects be built independently. The app has
no idea whether geometry came from a surveyed CAD file, an OpenCV run, or someone dragging
rectangles over a phone photo — and it does not need to.

It is also what makes the theme swappable: because emitted SVGs carry zero styling, the look
can be redesigned later and **every colony updates at once** without a single file being
regenerated. That guarantee only holds if the discipline is absolute. One hardcoded fill and
it is gone.

Two details that break silently rather than loudly, both learned the hard way:

- **`<use>` with no `width`/`height`** defaults to 100% of the viewport, so every tree
  scales to cover the whole map. Every unit test passed; only a raster render caught it.
- **Missing the Y-flip** renders the plan mirrored, and mirrored looks plausible — the
  plots are all there and the roads all connect.

## Rejected alternatives

- **Styling baked in at generation** — each file looks right standalone, and every theme
  change becomes a regeneration of every colony.
- **A looser contract with runtime negotiation** — more flexible, and it means neither side
  can be tested without the other.

## Blast radius

Maximum in this repo. Changing this breaks both projects, and it breaks them quietly — the
app renders an empty map rather than raising an error.
