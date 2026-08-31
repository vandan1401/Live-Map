"""COL-ZOOM-REF export: ring_extent_px, manifest.select_zoom, the QA sanity band, and the
end-to-end orchestrate_export path (docs/plans/20.md). Split out of test_export.py to keep
it under invariant 7's 250-line cap.
"""

from __future__ import annotations

import json
from pathlib import Path

import ezdxf
import pytest

from pipeline.derive.corner import is_plot_corner
from pipeline.derive.facing import resolve_facing
from pipeline.derive.roads import derive_road
from pipeline.export import ExportError
from pipeline.export.manifest import build_manifest
from pipeline.export.normalise import compute_transform, ring_extent_px
from pipeline.export.qa import run_qa
from pipeline.export.run import orchestrate_export
from pipeline.export.svg import build_svg
from pipeline.extract.types import ColonyConfig, Label, Ring
from pipeline.matching.assign import MatchedPlot

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

_SITE = Ring(layer="COL-SITE", handle="S1", points=((0, 0), (200, 0), (200, 100), (0, 100)))
_PLOT_RING = Ring(layer="COL-PLOT", handle="P1", points=((0, 70), (20, 70), (20, 100), (0, 100)))
_PLOT_LABEL = Label(
    layer="COL-PLOT-NO", handle="L1", text="1", point=(10, 85), rotation_deg=0.0, height=None
)
_PLOT = MatchedPlot(ring=_PLOT_RING, label=_PLOT_LABEL, svg_id="plot-A-01", block="A", number="01")


def test_ring_extent_px_scales_and_ignores_translation() -> None:
    # _SITE spans (0,0)-(200,100), scale = VIEWBOX_WIDTH_PX / 200 = 5.0.
    t = compute_transform(_SITE)
    ring = Ring(layer="COL-ZOOM-REF", handle="Z1", points=((50, 50), (80, 50), (80, 70), (50, 70)))
    width_px, height_px = ring_extent_px(t, ring)
    assert width_px == pytest.approx(150.0)  # 30 ft * 5.0
    assert height_px == pytest.approx(100.0)  # 20 ft * 5.0


def _manifest_without_zoom_ref() -> dict:
    road = derive_road(_SITE, [_PLOT_RING])
    t = compute_transform(_SITE)
    facings = {_PLOT.svg_id: resolve_facing(_PLOT.ring, road, 0.0)}
    corners = {_PLOT.svg_id: is_plot_corner(_PLOT.ring, road)}
    return build_manifest(_CONFIG, t, [_PLOT], [], 0.0, facings, corners)


def test_manifest_has_no_select_zoom_key_without_a_zoom_ref() -> None:
    assert "select_zoom" not in _manifest_without_zoom_ref()["colony"]


def test_manifest_includes_select_zoom_when_zoom_ref_present() -> None:
    road = derive_road(_SITE, [_PLOT_RING])
    t = compute_transform(_SITE)
    facings = {_PLOT.svg_id: resolve_facing(_PLOT.ring, road, 0.0)}
    corners = {_PLOT.svg_id: is_plot_corner(_PLOT.ring, road)}
    zoom_ref = Ring(layer="COL-ZOOM-REF", handle="Z1", points=((0, 0), (36, 0), (36, 64), (0, 64)))
    manifest = build_manifest(_CONFIG, t, [_PLOT], [], 0.0, facings, corners, zoom_ref)
    assert manifest["colony"]["select_zoom"] == {"ref_width_px": 180.0, "ref_height_px": 320.0}


def test_zoom_ref_wider_than_site_blocks_export(tmp_path: Path) -> None:
    manifest = _manifest_without_zoom_ref()
    manifest["colony"]["select_zoom"] = {"ref_width_px": 1200.0, "ref_height_px": 100.0}
    road = derive_road(_SITE, [_PLOT_RING])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [_PLOT], [], (), "test-colony", [])

    with pytest.raises(ExportError, match="COL-ZOOM-REF"):
        run_qa(manifest, [_PLOT], _CONFIG, svg, tmp_path, allow_id_change=False)


def _build_export_dxf(tmp_path: Path, include_zoom_ref: bool) -> tuple[Path, Path]:
    doc = ezdxf.new("R2013")
    for name in ("COL-SITE", "COL-PLOT", "COL-PLOT-NO", "COL-GARDEN", "COL-AMENITY",
                 "COL-WATER", "COL-FEATURE-NO", "COL-NORTH", "COL-ZOOM-REF"):
        doc.layers.add(name)
    doc.modelspace().add_lwpolyline(
        list(_SITE.points), close=True, dxfattribs={"layer": "COL-SITE"}
    )
    doc.modelspace().add_lwpolyline(
        list(_PLOT_RING.points), close=True, dxfattribs={"layer": "COL-PLOT"}
    )
    doc.modelspace().add_text(
        _PLOT_LABEL.text, dxfattribs={"layer": "COL-PLOT-NO", "insert": _PLOT_LABEL.point}
    )
    if include_zoom_ref:
        doc.modelspace().add_lwpolyline(
            [(150, 60), (190, 60), (190, 90), (150, 90)],
            close=True,
            dxfattribs={"layer": "COL-ZOOM-REF"},
        )
    dxf_path = tmp_path / "colony.dxf"
    doc.saveas(dxf_path)

    colonies_dir = tmp_path / "colonies"
    colonies_dir.mkdir()
    (colonies_dir / f"{_CONFIG.id}.json").write_text(
        json.dumps(
            {
                "id": _CONFIG.id,
                "name": _CONFIG.name,
                "units": _CONFIG.units,
                "expected_plots": _CONFIG.expected_plots,
                "blocks": list(_CONFIG.blocks),
                "number_width": _CONFIG.number_width,
                "number_range": list(_CONFIG.number_range),
                "north_deg": _CONFIG.north_deg,
                "source": _CONFIG.source,
            }
        )
    )
    return dxf_path, colonies_dir


def test_orchestrate_export_writes_select_zoom_from_col_zoom_ref(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path, include_zoom_ref=True)
    out_dir = tmp_path / "out"

    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)

    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    # _SITE spans (0,0)-(200,100), scale = 1000/200 = 5.0; the zoom-ref rectangle is 40x30.
    assert manifest["colony"]["select_zoom"] == {"ref_width_px": 200.0, "ref_height_px": 150.0}


def test_orchestrate_export_omits_select_zoom_without_col_zoom_ref(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path, include_zoom_ref=False)
    out_dir = tmp_path / "out"

    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)

    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    assert "select_zoom" not in manifest["colony"]
