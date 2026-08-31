"""Normalise: translate to origin, flip Y, scale to a fixed viewBox width (M13,
spec/13-pipe-derive-export.md, D-110). CAD counts Y upward; SVG counts Y downward -- every
coordinate emitted anywhere (SVG path data, manifest centroids) goes through apply_transform,
so the flip can never be forgotten in one place and not another.
"""

from __future__ import annotations

from dataclasses import dataclass

from pipeline.extract.types import Point, Ring

VIEWBOX_WIDTH_PX = 1000  # contract/SPEC.md: "viewBox width is always 1000" (D-110)


@dataclass(frozen=True)
class Transform:
    """scale is drawing-units-per-pixel -- this is exactly what the manifest's
    colony.scale.px_per_ft is. It is always derived here from the site's real width, never
    read from colony config (docs/plans/14.md Section 3: a fixed config constant cannot also
    guarantee viewBox width == 1000 for an arbitrary site size)."""

    min_x: float
    min_y: float
    max_y: float
    scale: float
    height_px: float


def compute_transform(site: Ring) -> Transform:
    xs = [p[0] for p in site.points]
    ys = [p[1] for p in site.points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    scale = VIEWBOX_WIDTH_PX / (max_x - min_x)
    height_px = (max_y - min_y) * scale

    return Transform(min_x=min_x, min_y=min_y, max_y=max_y, scale=scale, height_px=height_px)


def apply_transform(t: Transform, point: Point) -> Point:
    x, y = point
    return ((x - t.min_x) * t.scale, (t.max_y - y) * t.scale)


def ring_extent_px(t: Transform, ring: Ring) -> tuple[float, float]:
    """Width/height of ring's bounding box, in SVG viewBox px -- translation-invariant,
    unlike apply_transform (which maps one point). Assumes ring is axis-aligned to the
    DXF's own X/Y axes, the same assumption the rest of this pipeline makes everywhere
    (no rotation is ever applied, only translate + Y-flip + uniform scale)."""
    xs = [p[0] for p in ring.points]
    ys = [p[1] for p in ring.points]
    return (max(xs) - min(xs)) * t.scale, (max(ys) - min(ys)) * t.scale
