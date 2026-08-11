# M11 — Geometry core

**Tier 1** (`tools/pipeline/pipeline/geom/`). Pure module, no I/O. **Tests written first.**

## Goal

The shared geometry layer every other module depends on. Small, pure, exhaustively tested.

## Build

- `snap` — round every coordinate to a grid before polygonizing. Hairline gaps of 0.0001
  units are invisible on screen and silently break polygonization. This one function
  decides whether messy input is recoverable, so it gets the most tests.
- `polygonize` — segments → closed faces via `unary_union` + `polygonize`. Discard faces
  under an area threshold and the outermost face (that is the site).
- `dedupe` — plans routinely draw the same polyline twice. Key on rounded centroid plus
  rounded area.
- `simplify` — `minimum_rotated_rectangle` by default (D-106), with a `keep_shape` flag
  for the irregular plots the row tools cannot express.
- `contains`, `centroid`, `area_sqft`, `nearest_edge_bearing` — used by matching and derive.

Every function takes and returns shapely objects or plain tuples. No file handles, no
`fitz`, no `cv2`. That purity is what makes this layer cheap to test and is enforced by an
import test.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Snapping closes a 0.001-unit gap; a 5-unit gap stays open | `pytest tests/test_geom.py -q` |
| 2 | Polygonize on the demo rings yields exactly 45 plot-sized faces | Same |
| 3 | Duplicate polylines collapse to one | Same |
| 4 | `simplify` on a five-sided plot with `keep_shape` preserves five vertices | Same |
| 5 | `area_sqft` matches the golden manifest within 1% | Compare to `fixtures/shree-vatika-2/colony.json` |
| 6 | No module in `tools/pipeline/pipeline/geom` imports fitz, cv2, or PIL | Import test |
| 7 | `/review` returns no findings above the correctness bar | Reviewer output |
