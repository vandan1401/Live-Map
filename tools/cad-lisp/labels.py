"""Cross-check plot-number labels (MTEXT/TEXT) against traced polygons, so
close_polygons.py can report exactly which named plots got fused together by an
unclosed internal wall, or are missing a polygon entirely -- not just an abstract
open-endpoint count (found while diagnosing a real colony where 397 traced polygons
looked short of 600+ plots: every label was present, but ~150 polygons had swallowed
several plots each). Default pattern matches bare numbers ("101") and block-letter
numbers ("S-1", "E-22"); override with --label-pattern for a different numbering scheme.
"""

from __future__ import annotations

import re
from typing import Iterable

from ezdxf.entities import DXFGraphic
from shapely.geometry import Point, Polygon

DEFAULT_LABEL_PATTERN = r"\d{1,4}|[A-Za-z]{1,3}-?\d{1,4}[A-Za-z]?"

# text, (x, y), and the source entity itself -- kept so a caller can copy just the
# labels that matched into a clean output file, without dragging along every other
# MTEXT/TEXT (dimensions, notes) that shared the same layer in the real drawing.
Label = tuple[str, tuple[float, float], DXFGraphic]


def find_plot_labels(entities: Iterable[DXFGraphic], pattern: str) -> list[Label]:
    regex = re.compile(pattern)
    labels: list[Label] = []
    for entity in entities:
        dxftype = entity.dxftype()
        if dxftype == "MTEXT":
            text = entity.plain_text().strip()
        elif dxftype == "TEXT":
            text = entity.dxf.text.strip()
        else:
            continue
        if regex.fullmatch(text):
            labels.append((text, _label_point(entity), entity))
    return labels


def _label_point(entity: DXFGraphic) -> tuple[float, float]:
    """The text's visual centre, not its DXF anchor point. MTEXT's `insert` is the
    corner named by attachment_point (usually top-left), not the centre a human -- or
    AutoCAD's own pick/select -- associates with the text; a plot number sitting close
    to a shared wall can anchor a hair on one polygon's side while rendering visibly
    over its neighbour, which produced a false "fused" report on a real colony where
    the true click (confirmed via AutoCAD's LIST command) landed on the other plot."""
    point = entity.dxf.insert
    if entity.dxftype() != "MTEXT":
        return (point[0], point[1])
    width = entity.dxf.get("width", 0) or 0
    height = entity.dxf.get("defined_height", 0) or entity.dxf.char_height
    direction = entity.dxf.get("text_direction", None)
    if not direction:
        return (point[0], point[1])
    dx, dy = direction[0], direction[1]
    px, py = dy, -dx  # 90 deg clockwise from text direction -- "down" from a top anchor
    # attachment_point 1-9 = (Top/Middle/Bottom) x (Left/Center/Right), row-major
    attach = entity.dxf.get("attachment_point", 1) - 1
    h_factor = (0.5, 0.0, -0.5)[attach % 3]  # left/center/right
    v_factor = (0.5, 0.0, -0.5)[attach // 3]  # top/middle/bottom
    return (
        point[0] + dx * width * h_factor + px * height * v_factor,
        point[1] + dy * width * h_factor + py * height * v_factor,
    )


def match_labels_to_polygons(
    labels: list[Label], polygons: list[Polygon]
) -> tuple[dict[int, list[str]], list[Label]]:
    """Returns {polygon index: [label texts inside it]} and labels inside no polygon."""
    by_polygon: dict[int, list[str]] = {}
    unmatched: list[Label] = []
    for text, (x, y), entity in labels:
        point = Point(x, y)
        hit = next((i for i, poly in enumerate(polygons) if poly.contains(point)), None)
        if hit is None:
            unmatched.append((text, (x, y), entity))
        else:
            by_polygon.setdefault(hit, []).append(text)
    return by_polygon, unmatched
