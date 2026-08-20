"""Trees scattered procedurally (M13, spec/13-pipe-derive-export.md). Seeded from the
colony id, never random() or the clock (D-105) -- two clean runs must produce
byte-identical positions, which is what makes the idempotency test meaningful.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import cast

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry.base import BaseGeometry

from pipeline.derive import stable_seed
from pipeline.extract.types import Point

TREE_SPACING_FT = 25.0  # typical avenue-tree spacing along a road/garden edge
TREE_INSET_FT = 5.0  # inward buffer before sampling, keeps trees off the exact boundary line
TREE_JITTER_FT = 3.0  # random positional jitter magnitude, seeded for determinism


def _polygons(geom: BaseGeometry) -> list[Polygon]:
    if geom.is_empty:
        return []
    polys: list[Polygon] = (
        list(geom.geoms) if isinstance(geom, MultiPolygon) else [cast(Polygon, geom)]
    )
    # Deterministic order regardless of shapely's internal iteration order.
    return sorted(polys, key=lambda p: p.bounds)


def scatter_trees(colony_id: str, areas: Sequence[tuple[str, BaseGeometry]]) -> tuple[Point, ...]:
    """areas is [("road", road_geom), *(("garden", garden_poly) ...)] -- callers must pass
    a fixed, deterministic order (e.g. gardens sorted by their source ring's handle), since
    the order areas are visited in is part of the seeded random stream."""
    rng = random.Random(stable_seed(colony_id))
    points: list[Point] = []

    for _name, geom in areas:
        for poly in _polygons(geom.buffer(-TREE_INSET_FT)):
            minx, miny, maxx, maxy = poly.bounds
            y = miny
            while y <= maxy:
                x = minx
                while x <= maxx:
                    jx = x + rng.uniform(-TREE_JITTER_FT, TREE_JITTER_FT)
                    jy = y + rng.uniform(-TREE_JITTER_FT, TREE_JITTER_FT)
                    if poly.covers(ShapelyPoint(jx, jy)):
                        points.append((jx, jy))
                    x += TREE_SPACING_FT
                y += TREE_SPACING_FT

    return tuple(points)
