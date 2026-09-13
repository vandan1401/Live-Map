"""colony.json's optional `backdrop` block: a hand-declared, per-colony-config value with no
DXF source, passed through build_manifest() verbatim -- and the end-to-end orchestrate_export
path proving a colonies/<id>.json declaration survives a real export (docs/plans/32.md task H).
Mirrors test_export_zoom_ref.py's exact shape for the same reason select_zoom needed its own
file: invariant 7's 250-line cap.
"""

from __future__ import annotations

import json
from pathlib import Path

import ezdxf

from pipeline.derive.corner import is_plot_corner
from pipeline.derive.facing import resolve_facing
from pipeline.derive.roads import derive_road
from pipeline.export.manifest import build_manifest
from pipeline.export.normalise import compute_transform
from pipeline.export.run import orchestrate_export
from pipeline.extract.types import ColonyConfig, Label, Ring
from pipeline.matching.assign import MatchedPlot

_BACKDROP = {
    "transform": {"x": 864, "y": 283, "scale": 0.105, "rotate_deg": 0},
    "darken_alpha": 0.65,
    "enabled_on_admin": True,
    "enabled_on_public": True,
    "attribution": "OpenStreetMap contributors (ODbL)",
}

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
_CONFIG_WITH_BACKDROP = ColonyConfig(
    id=_CONFIG.id,
    name=_CONFIG.name,
    units=_CONFIG.units,
    expected_plots=_CONFIG.expected_plots,
    blocks=_CONFIG.blocks,
    default_block=_CONFIG.default_block,
    number_width=_CONFIG.number_width,
    number_range=_CONFIG.number_range,
    north_deg=_CONFIG.north_deg,
    source=_CONFIG.source,
    backdrop=_BACKDROP,
)

_SITE = Ring(layer="COL-SITE", handle="S1", points=((0, 0), (200, 0), (200, 100), (0, 100)))
_PLOT_RING = Ring(layer="COL-PLOT", handle="P1", points=((0, 70), (20, 70), (20, 100), (0, 100)))
_PLOT_LABEL = Label(
    layer="COL-PLOT-NO", handle="L1", text="1", point=(10, 85), rotation_deg=0.0, height=None
)
_PLOT = MatchedPlot(ring=_PLOT_RING, label=_PLOT_LABEL, svg_id="plot-A-01", block="A", number="01")


def _build_manifest(config: ColonyConfig) -> dict:
    road = derive_road(_SITE, [_PLOT_RING])
    t = compute_transform(_SITE)
    facings = {_PLOT.svg_id: resolve_facing(_PLOT.ring, road, 0.0)}
    corners = {_PLOT.svg_id: is_plot_corner(_PLOT.ring, road)}
    return build_manifest(config, t, [_PLOT], [], 0.0, facings, corners)


def test_manifest_has_no_backdrop_key_without_one_in_config() -> None:
    assert "backdrop" not in _build_manifest(_CONFIG)["colony"]


def test_manifest_includes_backdrop_verbatim_when_config_has_one() -> None:
    manifest = _build_manifest(_CONFIG_WITH_BACKDROP)
    assert manifest["colony"]["backdrop"] == _BACKDROP


def _build_export_dxf(tmp_path: Path, backdrop: dict | None) -> tuple[Path, Path]:
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
    dxf_path = tmp_path / "colony.dxf"
    doc.saveas(dxf_path)

    colonies_dir = tmp_path / "colonies"
    colonies_dir.mkdir()
    config_data = {
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
    if backdrop is not None:
        config_data["backdrop"] = backdrop
    (colonies_dir / f"{_CONFIG.id}.json").write_text(json.dumps(config_data))
    return dxf_path, colonies_dir


def test_orchestrate_export_writes_backdrop_from_colony_config(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path, backdrop=_BACKDROP)
    out_dir = tmp_path / "out"

    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)

    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    assert manifest["colony"]["backdrop"] == _BACKDROP


def test_orchestrate_export_omits_backdrop_without_one_in_colony_config(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path, backdrop=None)
    out_dir = tmp_path / "out"

    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)

    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    assert "backdrop" not in manifest["colony"]
