"""geometry -> SVG path `d` string, every coordinate run through the one export transform
(M13, spec/13-pipe-derive-export.md). Handles a Polygon's holes (interiors) as separate
subpaths -- this is what "one compound path" means for the road, which typically has a hole
wherever a fully-interior plot/garden/amenity/water ring sat.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import cast

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from pipeline.export.normalise import Transform, apply_transform
from pipeline.extract.types import Point


def _ring_d(coords: Sequence[tuple[float, ...]], t: Transform) -> str:
    points: list[Point] = [apply_transform(t, (c[0], c[1])) for c in coords]
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]

    parts = [f"M{points[0][0]:.2f},{points[0][1]:.2f}"]
    parts.extend(f"L{x:.2f},{y:.2f}" for x, y in points[1:])
    parts.append("Z")
    return " ".join(parts)


def polygon_to_path_d(geom: BaseGeometry, t: Transform) -> str:
    if geom.is_empty:
        return ""

    polys: list[Polygon] = (
        list(geom.geoms) if isinstance(geom, MultiPolygon) else [cast(Polygon, geom)]
    )
    subpaths: list[str] = []
    for poly in polys:
        subpaths.append(_ring_d(list(poly.exterior.coords), t))
        for interior in poly.interiors:
            subpaths.append(_ring_d(list(interior.coords), t))
    return " ".join(subpaths)
