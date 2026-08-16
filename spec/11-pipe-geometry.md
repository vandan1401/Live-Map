# M11 — Geometry core

**Tier 1** (`tools/pipeline/pipeline/geom/`). Pure module, no I/O. **Tests written first.**

Rewritten under D-118. `snap`, `polygonize`, and `dedupe` are **deleted** — they existed to
rebuild rings from PDF line soup, and a normalised DXF hands us closed rings directly. What
replaces them is validation: proving the rings we were given are actually usable.

## Goal

The shared geometry layer every other module depends on. Small, pure, exhaustively tested.

## Build

- `validate_ring` — the ring is closed, has ≥3 distinct vertices, and is not
  self-intersecting. A bow-tie polygon has a well-defined area of nearly zero and looks fine
  on screen; it must fail here rather than silently produce a plot with no area.
- `validate_disjoint` — no two plot rings overlap by more than a hairline tolerance. Shared
  boundaries are normal and must pass; a genuinely double-counted strip of land must not.
  Pin the tolerance in the plan — it is a judgement about draughting slop, not a constant.
- `validate_within` — every plot, garden, amenity, and water ring falls inside the site ring.
- `simplify` — `minimum_rotated_rectangle` by default (D-106), with a `keep_shape` flag for
  irregular plots.
- `contains`, `centroid`, `area_sqft`, `nearest_edge_bearing` — used by M12 and M13.

Every function takes and returns shapely objects or plain tuples. No file handles, no
`ezdxf`, no `fitz`, no `cv2`. That purity is what makes this layer cheap to test and is
enforced by an import test.

Validation failures carry the entity handle through from M10, so a geometry error still
points at one selectable object in AutoCAD.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | A self-intersecting bow-tie ring fails `validate_ring` | `pytest tests/test_geom.py -q` |
| 2 | A ring with a 0.001-unit gap between first and last vertex fails as not closed | Same |
| 3 | Two plots sharing an exact boundary pass `validate_disjoint`; a 2-ft overlap fails | Same |
| 4 | A plot outside the site ring fails `validate_within` | Same |
| 5 | `simplify` on a five-sided plot with `keep_shape` preserves five vertices | Same |
| 6 | `area_sqft` matches `fixtures/shree-vatika-2/colony.json` within 1% for all 26 plots | Same |
| 7 | No module in `pipeline/geom` imports `ezdxf`, `fitz`, `cv2`, or `PIL` | Import test |
| 8 | `/review` returns no findings above the correctness bar | Reviewer output |

## Note on criterion 2

Under the old PDF path a 0.001-unit gap was something `snap` had to *heal*; here it is
something validation must *reject*. That inversion is the point of D-118 — a gap in a DXF
means the owner did not `PEDIT → Close`, and the fix is four seconds in AutoCAD rather than
a tolerance constant that silently reshapes land.
