"""Geometry core for close_polygons.py: flatten DXF curve entities into point paths,
bridge small gaps between open endpoints, and trace closed regions with shapely.

Mirrors cv-tools.lsp's CV-CLOSE algorithm (gap-bridge, then boundary-trace) but runs the
trace as a proper planar-graph polygonize instead of AutoCAD's per-point -BOUNDARY sweep,
which does not scale to a real colony's entity count -- that sweep is what was hanging
and crashing AutoCAD. No dependency on cv-tools.lsp, contract/, or tools/pipeline.
"""

from __future__ import annotations

import math
from typing import Iterable

import ezdxf.path as path_mod
from ezdxf.entities import DXFGraphic
from shapely.geometry import JOIN_STYLE, LineString, Point as ShapelyPoint, Polygon
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

TOUCH_EPS = 1e-6  # endpoints closer than this are already coincident, not a gap
MIN_POLYGON_AREA = 1e-3  # sq ft; drops degenerate slivers polygonize can emit at shared edges
COORD_PRECISION = 6  # decimal places; enough to dedupe float noise without merging real corners

Point = tuple[float, float]


def entity_to_points(entity: DXFGraphic, curve_tolerance: float) -> list[Point]:
    """Flatten one entity (LINE, LWPOLYLINE with bulges, POLYLINE, ARC, or CIRCLE) into
    a list of (x, y) vertices, straight enough that consecutive points can stand in for
    the curve within curve_tolerance drawing units."""
    path = path_mod.make_path(entity)
    pts = [
        (round(v.x, COORD_PRECISION), round(v.y, COORD_PRECISION))
        for v in path.flattening(curve_tolerance)
    ]
    deduped: list[Point] = []
    for pt in pts:
        if not deduped or pt != deduped[-1]:
            deduped.append(pt)
    return deduped


def flatten_entities(entities: Iterable[DXFGraphic], curve_tolerance: float) -> list[list[Point]]:
    return [
        pts
        for entity in entities
        if len(pts := entity_to_points(entity, curve_tolerance)) >= 2
    ]


def collect_loose_endpoints(paths: list[list[Point]]) -> list[tuple[Point, int]]:
    """The two true endpoints of every entity that isn't already a closed loop itself --
    the candidates CV-CLOSE's gap-bridge considers, same as cv:collect-endpoints."""
    loose: list[tuple[Point, int]] = []
    for idx, pts in enumerate(paths):
        start, end = pts[0], pts[-1]
        if math.dist(start, end) <= TOUCH_EPS:
            continue
        loose.append((start, idx))
        loose.append((end, idx))
    return loose


def bridge_gaps(
    loose: list[tuple[Point, int]], paths: list[list[Point]], gap_tolerance: float
) -> tuple[list[tuple[Point, Point]], list[tuple[Point, int]]]:
    """Bridge genuinely open endpoints within tolerance, flag the rest.

    cv:bridge-gaps in cv-tools.lsp pairs each open endpoint off against one partner and
    consumes both from a shared pool -- so an endpoint that already exactly touches
    another one "wins" that match, and any *third* endpoint that also needed to reach
    that same coordinate (e.g. an interior wall meeting a boundary already closed by two
    other entities) finds its real target gone and gets a false flag, or a false bridge to
    some unrelated point, instead (found while porting this to Python). Fixed here by
    treating "does this coordinate already exist elsewhere" as a per-endpoint question,
    not a one-partner-per-endpoint pairing: an open endpoint's bridge target can be any
    other entity's endpoint, whether or not that target is itself already touching a
    third entity -- a real corner can validly have more than two entities meeting at it.

    Also checks each open endpoint against every *other entity's full line*, not just its
    endpoints -- a real colony draws plenty of T-junctions (an internal partition wall
    meeting a long boundary wall partway along its length, not at a shared corner), and an
    endpoint-only check flags those every time no matter how tight the geometry actually
    is (found on a real colony: 98.5% of "unresolved" endpoints were within tolerance of
    another line's interior, most touching exactly, and every one had been flagged anyway).
    """
    by_point: dict[Point, list[int]] = {}
    for point, entity_idx in loose:
        by_point.setdefault(point, []).append(entity_idx)
    singles = [point for point, idxs in by_point.items() if len(idxs) == 1]

    lines = [LineString(pts) for pts in paths]
    tree = STRtree(lines)

    bridges: set[tuple[Point, Point]] = set()
    flags: list[tuple[Point, int]] = []
    for point in singles:
        entity_idx = by_point[point][0]
        best_pt: Point | None = None
        best_d: float | None = None
        for other, idxs in by_point.items():
            if other == point or idxs == [entity_idx]:
                continue  # same coordinate, or this entity's own other endpoint
            d = math.dist(point, other)
            if best_d is None or d < best_d:
                best_pt, best_d = other, d

        shapely_pt = ShapelyPoint(point)
        for idx in tree.query(shapely_pt.buffer(gap_tolerance)):
            idx = int(idx)
            if idx == entity_idx:
                continue
            d = lines[idx].distance(shapely_pt)
            if best_d is None or d < best_d:
                proj = lines[idx].interpolate(lines[idx].project(shapely_pt))
                best_pt, best_d = (proj.x, proj.y), d

        if best_pt is not None and best_d is not None and best_d <= gap_tolerance:
            if best_d > TOUCH_EPS:  # already exactly touching -- no bridge segment needed
                bridges.add((point, best_pt) if point < best_pt else (best_pt, point))
        else:
            flags.append((point, entity_idx))
    return list(bridges), flags


def trace_polygons(
    paths: list[list[Point]], bridges: list[tuple[Point, Point]], min_width: float = 0.0
) -> list[Polygon]:
    lines = [LineString(pts) for pts in paths]
    lines += [LineString(bridge) for bridge in bridges]
    noded = unary_union(lines)
    polys = [p for p in polygonize(noded) if p.area > MIN_POLYGON_AREA]
    if min_width > 0:
        trimmed = [t for p in polys for t in trim_thin_parts(p, min_width)]
        polys = [p for p in trimmed if p.area > MIN_POLYGON_AREA]
    return polys


def trim_thin_parts(polygon: Polygon, min_width: float) -> list[Polygon]:
    """Morphological opening: erode inward by min_width/2 then dilate back out. Any
    protrusion (a sliver bridging two rows, a stray notch) narrower than min_width
    vanishes in the erosion and never comes back; a polygon entirely thinner than
    min_width vanishes outright. Splits into separate polygons if erosion disconnects
    what used to be one shape -- e.g. two rows joined only by a thin sliver."""
    eps = min_width / 2.0
    eroded = polygon.buffer(-eps, join_style=JOIN_STYLE.mitre)
    if eroded.is_empty:
        return []
    opened = eroded.buffer(eps, join_style=JOIN_STYLE.mitre)
    if opened.geom_type == "Polygon":
        return [opened]
    if opened.geom_type == "MultiPolygon":
        return list(opened.geoms)
    return []
