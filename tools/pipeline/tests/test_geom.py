"""M11 -- pipeline/geom (spec/11-pipe-geometry.md, docs/plans/12.md). Synthetic Ring/Point
data only -- no ezdxf; geom never touches the DXF format (tier-1.md purity requirement).
"""

from __future__ import annotations

import ast
import json
import pathlib
from pathlib import Path

import pytest

from pipeline.extract.types import Point, Ring
from pipeline.geom import (
    GeomError,
    area_sqft,
    centroid,
    contains,
    nearest_edge_bearing,
    simplify,
    validate_disjoint,
    validate_ring,
    validate_within,
)


def _ring(points: list[Point], handle: str = "1", layer: str = "COL-PLOT") -> Ring:
    return Ring(layer=layer, handle=handle, points=tuple(points))


def test_bowtie_ring_fails_validate_ring() -> None:
    ring = _ring([(0, 0), (10, 10), (10, 0), (0, 10)], handle="BOWTIE")
    with pytest.raises(GeomError, match="BOWTIE"):
        validate_ring(ring)


def test_small_first_last_gap_fails_as_not_closed() -> None:
    ring = _ring([(0, 0), (10, 0), (10, 10), (0, 10), (0.001, 0)], handle="GAP")
    with pytest.raises(GeomError, match="GAP"):
        validate_ring(ring)


def test_larger_botched_close_gap_still_fails_as_not_closed() -> None:
    # /review, 2026-08-20: a fixed 0.01 ft ceiling silently passed a 0.05 ft botched
    # close (collinear with the closing edge, so is_valid's self-intersection check
    # never catches it either) -- the gap must be compared against the ring's own
    # edge scale, not an absolute constant.
    ring = _ring([(0, 0), (10, 0), (10, 10), (0, 10), (0, 0.05)], handle="GAP2")
    with pytest.raises(GeomError, match="GAP2"):
        validate_ring(ring)


def test_normal_ring_passes_validate_ring() -> None:
    validate_ring(_ring([(0, 0), (10, 0), (10, 10), (0, 10)]))  # no raise


def test_two_point_ring_rejected() -> None:
    with pytest.raises(GeomError):
        validate_ring(_ring([(0, 0), (10, 0)]))


def test_shared_boundary_passes_validate_disjoint() -> None:
    a = _ring([(0, 0), (10, 0), (10, 10), (0, 10)], handle="A")
    b = _ring([(10, 0), (20, 0), (20, 10), (10, 10)], handle="B")
    validate_disjoint([a, b])  # no raise -- touching, zero-area intersection


def test_two_foot_overlap_fails_validate_disjoint() -> None:
    a = _ring([(0, 0), (10, 0), (10, 10), (0, 10)], handle="A")
    b = _ring([(8, 0), (18, 0), (18, 10), (8, 10)], handle="B")  # 2ft-wide, 20 sqft overlap
    with pytest.raises(GeomError, match="A.*B|B.*A"):
        validate_disjoint([a, b])


def test_plot_outside_site_fails_validate_within() -> None:
    site = _ring([(0, 0), (100, 0), (100, 100), (0, 100)], handle="SITE")
    inside = _ring([(10, 10), (20, 10), (20, 20), (10, 20)], handle="IN")
    outside = _ring([(200, 200), (210, 200), (210, 210), (200, 210)], handle="OUT")
    with pytest.raises(GeomError, match="OUT"):
        validate_within(site, [inside, outside])


def test_perimeter_plot_touching_site_boundary_passes_validate_within() -> None:
    site = _ring([(0, 0), (100, 0), (100, 100), (0, 100)], handle="SITE")
    perimeter = _ring([(0, 0), (10, 0), (10, 10), (0, 10)], handle="PERIM")
    validate_within(site, [perimeter])  # no raise -- covers, not contains (D-118/docs/plans/12.md)


def test_simplify_keep_shape_preserves_five_vertices() -> None:
    five_sided = _ring([(0, 0), (10, 0), (10, 10), (5, 15), (0, 10)])
    poly = simplify(five_sided, keep_shape=True)
    assert len(list(poly.exterior.coords)) - 1 == 5


def test_simplify_default_returns_minimum_rotated_rectangle() -> None:
    five_sided = _ring([(0, 0), (10, 0), (10, 10), (5, 15), (0, 10)])
    poly = simplify(five_sided)
    assert len(list(poly.exterior.coords)) - 1 == 4


def test_area_sqft_matches_golden_manifest_within_one_percent() -> None:
    manifest_path = Path(__file__).resolve().parents[3] / "fixtures" / "shree-vatika-2" / "colony.json"
    manifest = json.loads(manifest_path.read_text())
    for plot in manifest["plots"]:
        length, breadth = plot["length_ft"], plot["breadth_ft"]
        ring = _ring([(0, 0), (length, 0), (length, breadth), (0, breadth)], handle=plot["svg_id"])
        assert area_sqft(ring) == pytest.approx(plot["area_sqft"], rel=0.01), plot["svg_id"]


def test_contains_point_inside_and_outside() -> None:
    ring = _ring([(0, 0), (10, 0), (10, 10), (0, 10)])
    assert contains(ring, (5, 5))
    assert not contains(ring, (50, 50))


def test_centroid_of_square() -> None:
    cx, cy = centroid(_ring([(0, 0), (10, 0), (10, 10), (0, 10)]))
    assert cx == pytest.approx(5)
    assert cy == pytest.approx(5)


def test_nearest_edge_bearing_matches_compass_convention() -> None:
    # Same convention as pipeline.extract.dxf._resolve_north_deg (atan2(dx,dy) % 360,
    # 0=north/+y, 90=east/+x). Concrete values, not just a 0-360 range check -- a
    # sign-flipped or argument-swapped atan2 would still satisfy a bare range assertion
    # (/review, 2026-08-20).
    ring = _ring([(0, 0), (10, 0), (10, 10), (0, 10)])
    assert nearest_edge_bearing(ring, (5, -5)) == pytest.approx(0)  # below -> south edge, bearing north
    assert nearest_edge_bearing(ring, (-5, 5)) == pytest.approx(90)  # left -> west edge, bearing east
    assert nearest_edge_bearing(ring, (5, 15)) == pytest.approx(180)  # above -> north edge, bearing south
    assert nearest_edge_bearing(ring, (15, 5)) == pytest.approx(270)  # right -> east edge, bearing west


def test_geom_does_not_import_forbidden_format_libraries() -> None:
    import pipeline.geom as geom_pkg

    forbidden = {"ezdxf", "fitz", "cv2", "PIL"}
    pkg_dir = pathlib.Path(geom_pkg.__file__).parent
    for py_file in pkg_dir.rglob("*.py"):
        tree = ast.parse(py_file.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = {node.module.split(".")[0]}
            else:
                continue
            hit = names & forbidden
            assert not hit, f"{py_file}: forbidden import {hit}"
