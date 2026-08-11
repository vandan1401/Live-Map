# M13 — Derivation

**Tier 2** (`tools/pipeline/pipeline/derive/`).

## Goal

Everything the plan does not state explicitly but geometry can compute.

## Build

- **Roads by subtraction** — `site_boundary − union(plots, gardens, amenities, water)`.
  One shapely difference. Always correct regardless of how the draftsman drew the roads,
  and it costs nothing. Never extract roads from the source (D-104).
- **Trees procedurally** — offset the road polygon inward, sample at fixed intervals with
  jitter seeded from the colony id, emit `<use>` positions. Same seed means byte-identical
  output across runs, which is what makes the idempotency test meaningful (D-105).
  Also scatter inside garden polygons.
- **Facing** — find the nearest road edge to each plot, take its bearing, add `north_deg`,
  snap to eight compass points. East and north-facing plots carry a price premium in
  Indian plot sales, so this is a real field, not decoration.
- **`is_corner`** — the plot boundary touches road polygon on two or more non-parallel
  sides. Also a premium attribute.
- **`area_sqft`** — from the polygon and `px_per_ft`.

All four are computed once here and stored. Nothing recomputes them downstream (D-112).

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Road polygon covers the gaps between plots and touches no plot interior | Geometric assertion |
| 2 | Two clean runs produce byte-identical tree positions | Run twice, `diff` the SVGs |
| 3 | Facing matches the golden manifest for all 45 plots | `pytest tests/test_golden.py -q` |
| 4 | `is_corner` matches the golden manifest | Same |
| 5 | Areas within 1% of golden | Same |
| 6 | Full gate passes | `make gate` |
