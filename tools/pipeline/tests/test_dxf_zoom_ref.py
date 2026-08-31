"""COL-ZOOM-REF ingest: 0-or-1 cardinality, plain rectangle or scaled block insert
(docs/plans/20.md). Split out of test_dxf.py to keep it under invariant 7's 250-line cap.
"""

from __future__ import annotations

from pathlib import Path

import ezdxf
import pytest
from ezdxf.document import Drawing

from pipeline.extract.dxf import DxfConformanceError, ingest_dxf
from pipeline.extract.types import ColonyConfig

_STANDARD_LAYERS = (
    "COL-SITE", "COL-PLOT", "COL-PLOT-NO", "COL-GARDEN", "COL-AMENITY",
    "COL-WATER", "COL-FEATURE-NO", "COL-NORTH", "COL-ZOOM-REF",
)

_CONFIG = ColonyConfig(
    id="test-colony",
    name="Test Colony",
    units="ft",
    expected_plots=1,
    blocks=("A",),
    default_block="A",
    number_width=2,
    number_range=(1, 60),
    north_deg=0.0,
    source={"file": "test.dwg", "revision": "n/a", "plan_date": "2026-01-01", "method": "dxf"},
)


def _minimal_valid_doc() -> Drawing:
    doc = ezdxf.new("R2013")
    for name in _STANDARD_LAYERS:
        doc.layers.add(name)
    doc.modelspace().add_lwpolyline(
        [(0, 0), (100, 0), (100, 100), (0, 100)], close=True, dxfattribs={"layer": "COL-SITE"}
    )
    doc.modelspace().add_lwpolyline(
        [(10, 10), (20, 10), (20, 20), (10, 20)], close=True, dxfattribs={"layer": "COL-PLOT"}
    )
    doc.modelspace().add_text("7", dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15)})
    return doc


def _save(doc: Drawing, tmp_path: Path) -> Path:
    path = tmp_path / "colony.dxf"
    doc.saveas(path)
    return path


def test_no_zoom_ref_rectangle_succeeds_with_zoom_ref_none(tmp_path: Path) -> None:
    path = _save(_minimal_valid_doc(), tmp_path)
    result = ingest_dxf(path, _CONFIG)
    assert result.zoom_ref is None


def test_one_zoom_ref_rectangle_succeeds(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    doc.modelspace().add_lwpolyline(
        [(0, 0), (30, 0), (30, 20), (0, 20)], close=True, dxfattribs={"layer": "COL-ZOOM-REF"}
    )
    result = ingest_dxf(_save(doc, tmp_path), _CONFIG)
    assert result.zoom_ref is not None
    assert result.zoom_ref.layer == "COL-ZOOM-REF"
    assert set(result.zoom_ref.points) == {(0, 0), (30, 0), (30, 20), (0, 20)}


def test_two_zoom_ref_rectangles_errors(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    for pts in (((0, 0), (30, 0), (30, 20), (0, 20)), ((40, 40), (60, 40), (60, 60), (40, 60))):
        doc.modelspace().add_lwpolyline(list(pts), close=True, dxfattribs={"layer": "COL-ZOOM-REF"})
    with pytest.raises(DxfConformanceError):
        ingest_dxf(_save(doc, tmp_path), _CONFIG)


def test_zoom_ref_not_closed_errors(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    doc.modelspace().add_lwpolyline(
        [(0, 0), (30, 0), (30, 20)], close=False, dxfattribs={"layer": "COL-ZOOM-REF"}
    )
    with pytest.raises(DxfConformanceError):
        ingest_dxf(_save(doc, tmp_path), _CONFIG)


def test_zoom_ref_as_scaled_block_insert_resolves_to_real_coordinates(tmp_path: Path) -> None:
    # The owner's actual workflow (2026-08-29): define a 9:16 reference block once, then
    # INSERT + scale it per colony rather than redrawing a rectangle from scratch.
    doc = _minimal_valid_doc()
    blk = doc.blocks.new(name="ZOOM-REF-9x16")
    blk.add_lwpolyline([(0, 0), (9, 0), (9, 16), (0, 16)], close=True)
    ins = doc.modelspace().add_blockref(
        "ZOOM-REF-9x16", insert=(5, 5), dxfattribs={"layer": "COL-ZOOM-REF"}
    )
    ins.dxf.xscale = 2.0
    ins.dxf.yscale = 2.0

    result = ingest_dxf(_save(doc, tmp_path), _CONFIG)
    assert result.zoom_ref is not None
    assert set(result.zoom_ref.points) == {(5.0, 5.0), (23.0, 5.0), (23.0, 37.0), (5.0, 37.0)}


def test_zoom_ref_block_insert_with_two_polylines_errors(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    blk = doc.blocks.new(name="ZOOM-REF-BAD")
    blk.add_lwpolyline([(0, 0), (9, 0), (9, 16), (0, 16)], close=True)
    blk.add_lwpolyline([(20, 20), (30, 20), (30, 30), (20, 30)], close=True)
    doc.modelspace().add_blockref("ZOOM-REF-BAD", insert=(0, 0), dxfattribs={"layer": "COL-ZOOM-REF"})

    with pytest.raises(DxfConformanceError):
        ingest_dxf(_save(doc, tmp_path), _CONFIG)


def test_zoom_ref_rotated_block_insert_errors(tmp_path: Path) -> None:
    # ring_extent_px measures an axis-aligned bounding box (docs/plans/20.md's pinned
    # constraint) -- a rotated INSERT would silently mismeasure rather than error, so the
    # reader must reject it instead of guessing.
    doc = _minimal_valid_doc()
    blk = doc.blocks.new(name="ZOOM-REF-ROTATED")
    blk.add_lwpolyline([(0, 0), (9, 0), (9, 16), (0, 16)], close=True)
    ins = doc.modelspace().add_blockref(
        "ZOOM-REF-ROTATED", insert=(0, 0), dxfattribs={"layer": "COL-ZOOM-REF"}
    )
    ins.dxf.rotation = 30.0

    with pytest.raises(DxfConformanceError, match="rotation"):
        ingest_dxf(_save(doc, tmp_path), _CONFIG)
