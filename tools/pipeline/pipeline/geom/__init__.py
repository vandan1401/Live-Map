"""Pure geometry core (M11, spec/11-pipe-geometry.md). No file-format library -- no
ezdxf, fitz, cv2, or PIL -- and no I/O. Depends only on pipeline.extract.types' plain
dataclasses and shapely; every other pipeline module depends on this one.

D-118 rewrote this module from scratch: snap/polygonize/dedupe (the old PDF-line-soup
rebuilders) are deleted. What replaces them is validation -- proving the rings M10 handed
us are usable, not rebuilding them.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import cast

from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import Polygon
from shapely.ops import nearest_points

from pipeline.extract.types import Point, Ring

AREA_OVERLAP_TOLERANCE_SQFT = 0.1  # docs/plans/12.md: hairline draughting slop vs a real
# overlap -- a shared boundary's export/reimport rounding is thousandths of a sqft; a
# genuine overlap strip against any real plot edge is multiple sqft.

CLOSE_GAP_TOLERANCE_FT = 1e-6  # a first/last gap at or below this is an explicitly
# duplicated closing vertex -- intentional, not an error. Same constant as
# tools/cad-lisp/polygonize.py's TOUCH_EPS, for consistency.


class GeomError(Exception):
    """A ring fails a geometric validity check. Same shape as
    pipeline.extract.dxf.DxfConformanceError: every rejection names the entity handle
    (and layer, where known) so it still points at one selectable object in AutoCAD."""


def _polygon(ring: Ring) -> Polygon:
    return Polygon(ring.points)


def _shortest_drawn_edge(points: tuple[Point, ...]) -> float:
    return min(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1))


def validate_ring(ring: Ring) -> None:
    """The ring is closed, has >=3 distinct vertices, and is not self-intersecting."""
    distinct = set(ring.points)
    if len(distinct) < 3:
        raise GeomError(f"{ring.layer} entity {ring.handle} has fewer than 3 distinct vertices")

    # A real, legitimate closing edge (first vertex back to last) is one edge among
    # several, on the same order of magnitude as the ring's other edges. A botched
    # PEDIT-Close, by contrast, produces a gap far SHORTER than every edge actually
    # drawn -- no fixed absolute ceiling works here (a 0.05 ft gap is a real defect on
    # a 10 ft plot but could be a legitimate short edge on a needle-thin sliver), so
    # compare against the ring's own scale instead (found via /review, 2026-08-20: a
    # fixed 0.01 ft ceiling silently passed a 0.05 ft botched close).
    gap = math.dist(ring.points[0], ring.points[-1])
    if gap > CLOSE_GAP_TOLERANCE_FT and gap < _shortest_drawn_edge(ring.points):
        raise GeomError(
            f"{ring.layer} entity {ring.handle} is not closed "
            f"(first/last vertex gap {gap:.6f} ft, shorter than its shortest drawn edge)"
        )

    if not _polygon(ring).is_valid:
        raise GeomError(f"{ring.layer} entity {ring.handle} is self-intersecting")


def validate_disjoint(rings: Sequence[Ring]) -> None:
    """No two rings overlap by more than AREA_OVERLAP_TOLERANCE_SQFT. Shared boundaries
    (touching, zero-area intersection) are normal and must pass."""
    for i, a in enumerate(rings):
        poly_a = _polygon(a)
        for b in rings[i + 1 :]:
            overlap = poly_a.intersection(_polygon(b)).area
            if overlap > AREA_OVERLAP_TOLERANCE_SQFT:
                raise GeomError(
                    f"{a.layer} entity {a.handle} and {b.layer} entity {b.handle} "
                    f"overlap by {overlap:.2f} sqft"
                )


def validate_within(site: Ring, others: Sequence[Ring]) -> None:
    """Every ring in others falls inside site. Uses covers, not contains -- a perimeter
    plot's outer edge normally sits exactly on the site boundary, which contains() would
    (wrongly) reject as not-inside (docs/plans/12.md)."""
    site_poly = _polygon(site)
    for ring in others:
        if not site_poly.covers(_polygon(ring)):
            raise GeomError(
                f"{ring.layer} entity {ring.handle} falls outside "
                f"{site.layer} entity {site.handle}"
            )


def simplify(ring: Ring, keep_shape: bool = False) -> Polygon:
    """minimum_rotated_rectangle by default (D-106); keep_shape=True returns the ring's
    own polygon unchanged, vertex count preserved exactly."""
    poly = _polygon(ring)
    if keep_shape:
        return poly
    # minimum_rotated_rectangle is typed as BaseGeometry (the general case can degrade to
    # a Point/LineString for a degenerate input) but always a Polygon for the closed,
    # >=3-vertex, non-self-intersecting ring validate_ring already guarantees upstream.
    return cast(Polygon, poly.minimum_rotated_rectangle)


def contains(ring: Ring, point: Point) -> bool:
    return _polygon(ring).covers(ShapelyPoint(point))


def centroid(ring: Ring) -> Point:
    c = _polygon(ring).centroid
    return (c.x, c.y)


def area_sqft(ring: Ring) -> float:
    return _polygon(ring).area


def nearest_edge_bearing(ring: Ring, point: Point) -> float:
    """Degrees 0-360, clockwise from north -- same convention as
    pipeline.extract.dxf._resolve_north_deg -- from point to the nearest point on ring's
    boundary."""
    boundary = _polygon(ring).exterior
    _origin, nearest = nearest_points(ShapelyPoint(point), boundary)
    dx, dy = nearest.x - point[0], nearest.y - point[1]
    return math.degrees(math.atan2(dx, dy)) % 360
