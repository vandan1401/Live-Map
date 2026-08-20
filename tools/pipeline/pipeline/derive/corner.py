"""is_corner: a plot boundary touching road on two or more non-parallel sides (M13,
spec/13-pipe-derive-export.md). A premium attribute in Indian plot sales, same as facing.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from shapely.geometry import LineString
from shapely.geometry.base import BaseGeometry

from pipeline.extract.types import Ring

# A hairline draughting-slop contact must not count as "touching" -- same reasoning as
# pipeline.geom.AREA_OVERLAP_TOLERANCE_SQFT.
ROAD_TOUCH_MIN_LENGTH_FT = 1.0

# Two touching edges within this many degrees of each other (undirected, mod 180) count as
# the same side, not two distinct sides.
CORNER_ANGLE_TOLERANCE_DEG = 20.0


def is_plot_corner(plot: Ring, road: BaseGeometry) -> bool:
    n = len(plot.points)
    bearings: list[float] = []
    for i in range(n):
        a, b = plot.points[i], plot.points[(i + 1) % n]
        shared = LineString([a, b]).intersection(road)
        if shared.length > ROAD_TOUCH_MIN_LENGTH_FT:
            dx, dy = b[0] - a[0], b[1] - a[1]
            bearings.append(math.degrees(math.atan2(dx, dy)) % 180)
    return _count_distinct_sides(bearings) >= 2


def _count_distinct_sides(bearings: Sequence[float]) -> int:
    remaining = list(bearings)
    sides = 0
    while remaining:
        base = remaining.pop(0)
        sides += 1
        remaining = [b for b in remaining if not _same_side(base, b)]
    return sides


def _same_side(a: float, b: float) -> bool:
    diff = abs(a - b) % 180
    diff = min(diff, 180 - diff)
    return diff < CORNER_ANGLE_TOLERANCE_DEG
