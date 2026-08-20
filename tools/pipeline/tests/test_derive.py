"""M13 -- derive (spec/13-pipe-derive-export.md, docs/plans/14.md). Small synthetic
Ring/Point layouts, no ezdxf, same convention as tests/test_matching.py and
tests/test_geom.py.
"""

from __future__ import annotations

from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import Polygon

from pipeline.derive import stable_seed
from pipeline.derive.corner import is_plot_corner
from pipeline.derive.facing import resolve_facing
from pipeline.derive.roads import derive_road
from pipeline.derive.trees import scatter_trees
from pipeline.extract.types import Ring


def _rect(layer: str, handle: str, x0: float, y0: float, x1: float, y1: float) -> Ring:
    return Ring(layer=layer, handle=handle, points=((x0, y0), (x1, y0), (x1, y1), (x0, y1)))


def test_derive_road_covers_gap_and_excludes_plot_interior() -> None:
    site = _rect("COL-SITE", "S1", 0, 0, 100, 100)
    plot = _rect("COL-PLOT", "P1", 20, 20, 80, 80)

    road = derive_road(site, [plot])

    assert road.area == 10_000 - 3_600
    assert not road.covers(ShapelyPoint(50, 50))  # inside the plot
    assert road.covers(ShapelyPoint(10, 10))  # in the margin


def test_stable_seed_is_hardcoded_not_the_salted_builtin_hash() -> None:
    # A same-process equality/inequality check would pass unchanged even with the builtin
    # hash() -- that only breaks *across* processes, since it is salted per-process by
    # PYTHONHASHSEED (D-105). Pinning the literal sha256-derived value is what actually
    # catches a regression back to hash() within a single test run (/review, 2026-08-20).
    assert stable_seed("shree-vatika-2") == 195548392


def test_scatter_trees_is_deterministic_across_calls() -> None:
    road = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)]).difference(
        Polygon([(20, 20), (80, 20), (80, 80), (20, 80)])
    )
    areas = [("road", road)]

    first = scatter_trees("shree-vatika-2", areas)
    second = scatter_trees("shree-vatika-2", areas)

    assert first == second
    assert len(first) > 0


def test_resolve_facing_snaps_to_nearest_road() -> None:
    plot = _rect("COL-PLOT", "P1", 0, 0, 40, 40)
    road = Polygon([(0, 40), (100, 40), (100, 100), (0, 100)])  # due north of the plot

    assert resolve_facing(plot, road, north_deg=0.0) == "north"


def test_plot_touching_road_on_two_non_parallel_sides_is_a_corner() -> None:
    site = _rect("COL-SITE", "S1", 0, 0, 100, 100)
    plot = _rect("COL-PLOT", "P1", 30, 30, 70, 70)  # margin on all 4 sides -> road all round
    road = derive_road(site, [plot])

    assert is_plot_corner(plot, road) is True


def test_plot_touching_road_on_one_side_is_not_a_corner() -> None:
    site = _rect("COL-SITE", "S1", 0, 0, 100, 100)
    plot = _rect("COL-PLOT", "P1", 0, 0, 100, 50)  # spans full width, only the top is road
    road = derive_road(site, [plot])

    assert is_plot_corner(plot, road) is False
