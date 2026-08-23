# D-028: Opaque plot fill over a translucent tint, and `is_corner` as a one-time fetch

**Status:** accepted
**Date:** 2026-08-23
**Context:** Tier 3 map redesign session (`apps/map/src/components/map/*`), following three
owner-supplied reference screenshots of competitor/marketing site-plan renders.

## Decision

Two related but separable choices, both made the same session:

1. **Every plot paints an opaque `--colony-plot-base` fill first, then its status colour on
   top at `STATUS_FILL_ALPHA` (0.88).** This replaces the design that had shipped one day
   earlier (2026-08-22, the canvas rewrite): a plot had no fill of its own and instead
   showed the shared `--colony-ground-base` grass texture through a 0.38 translucent status
   tint, a ratio the owner had personally tuned on 2026-08-16 ("0.55 read as too high
   opacity... the grass must stay visible through a plot's status tint").
2. **A plot's own real corner-cut geometry is never cosmetically rounded.** The redesign
   also gave every plot a softly-rounded outline (`plotPath.ts`'s `roundedPlotPath()`,
   built from a new pure `roundedPolygonCorners()` in `lib/colony/plotGeometry.ts`) — except
   a plot whose manifest row has `is_corner = true`, which draws from its raw, un-rounded
   `d` instead. That flag lives on the `plots` table and is computed once at import
   (tier-2.md's "Derived fields" rule); it reaches the renderer via a new
   `fetchCornerPlotIds()` (`lib/db/plots.ts`) called **once at mount**, not through the
   realtime `attachSync` subscription that carries `status`.

## Why

**(1) Opaque fill.** All three of the owner's new reference images — a marketing site-plan
render, a competitor sales-portal screenshot, and a close-up of a selected plot — show flat,
fully opaque plot fills with no ground texture bleeding through. The 0.38 translucent-wash
design was tuned against a different, now-superseded aesthetic (the grass-photo-textured
look), not against these references. Reversing it is a direct, same-day owner instruction
against fresh evidence, not a guess.

**(2) One-time fetch, not realtime.** `status` changes constantly and must stay live —
that is the entire reason `attachSync` exists. `is_corner` is fundamentally different: it
is derived once from geometry at pipeline export and is never recomputed or overwritten
after that (tier-2.md states this explicitly for `facing`/`is_corner`/`area_sqft`). Routing
it through the realtime sync path in `lib/sync/` (Tier 1) would have meant touching Tier 1
code — requiring `/plan` + `/review` — for a value that structurally cannot go stale. A
plain one-off `supabase.from("plots").select("svg_id").eq("is_corner", true)` at mount,
mirroring `usePlotDimensions.ts`'s existing one-off fetch pattern, gets the same correctness
without the process cost or the layer violation.

## Rejected alternatives

- **Keep the 0.38 translucent tint, only change hue/road/font.** Would have left every
  status colour reading as a muddy green-brown blend in a browser screenshot next to
  references that show flat saturated colour — visibly wrong against what was asked for.
- **Infer "corner plot" geometrically** (e.g. "touches two edges of the overall site
  bounding box") instead of reading the manifest's `is_corner`. Rejected: the schema already
  has a precise, human/CAD-operator-confirmed field for exactly this concept
  (`docs/cad-layer-standard.md`, `contract/colony.schema.json`'s `facing`/`is_corner` rows);
  a geometric heuristic would be a second, weaker, silently-divergent definition of the same
  fact — exactly the failure mode tier-2.md's "Derived fields are computed once... two
  sources for one fact will eventually disagree" warns about.
- **Thread `is_corner` through `attachSync`/`lib/sync/` alongside `status`.** Rejected as
  unnecessary Tier 1 surface area for an immutable field, and because `attachSync`'s bulk
  load already has a specific, tested shape (`svg_id -> status`) that a second field would
  have to be bolted onto for no behavioural gain.

## Consequences

- `STATUS_FILL_ALPHA`'s value and `--colony-plot-base` now carry the owner's 2026-08-23
  taste, not the 2026-08-16 one — a future session must not "restore" the old ratio without
  checking which set of references is current; both tunings are recorded inline
  (`drawColony.ts`, `colony-theme.css`) with their dates.
- Any other manifest field that is "computed once, never recomputed" and needs to reach the
  canvas renderer should follow the same shape: a plain fetch in `lib/db/`, called once at
  mount from `components/map/`, not folded into `lib/sync/`.
