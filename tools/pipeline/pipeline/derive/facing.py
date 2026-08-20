"""Facing: which way a plot fronts the road (M13, spec/13-pipe-derive-export.md). East and
north-facing plots carry a real price premium in Indian plot sales -- this is a real field,
not decoration.
"""

from __future__ import annotations

import math

from shapely.geometry import Point as ShapelyPoint
from shapely.geometry.base import BaseGeometry
from shapely.ops import nearest_points

from pipeline.extract.types import Ring
from pipeline.geom import centroid

FACING_POINTS = (
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
)


def resolve_facing(plot: Ring, road: BaseGeometry, north_deg: float) -> str:
    """Bearing from the plot's centroid to the nearest point on the road boundary, corrected
    by north_deg, snapped to the nearest of 8 compass points. Same atan2(dx, dy) convention
    as pipeline.geom.nearest_edge_bearing (0 = drawing +Y, clockwise) -- not reused directly
    since road is an arbitrary derived BaseGeometry, not a Ring."""
    origin = ShapelyPoint(centroid(plot))
    _self, nearest = nearest_points(origin, road.boundary)
    dx, dy = nearest.x - origin.x, nearest.y - origin.y
    raw_bearing = math.degrees(math.atan2(dx, dy)) % 360

    true_bearing = (raw_bearing + north_deg) % 360
    index = round(true_bearing / 45) % 8
    return FACING_POINTS[index]
