"""Roads by subtraction (M13, spec/13-pipe-derive-export.md). Never extracted from the
source -- there is no road layer (D-104). Always correct regardless of how the draftsman
drew things, and costs one shapely call.
"""

from __future__ import annotations

from collections.abc import Sequence

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from pipeline.extract.types import Ring


def derive_road(site: Ring, others: Sequence[Ring]) -> BaseGeometry:
    """site minus the union of every plot/garden/amenity/water ring."""
    site_poly = Polygon(site.points)
    if not others:
        return site_poly
    carved = unary_union([Polygon(r.points) for r in others])
    return site_poly.difference(carved)
