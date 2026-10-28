"""colony.json's optional `statuses` list (docs/plans/40.md): a hand-declared, per-colony-config
value with no DXF source, passed through build_manifest() verbatim, and the end-to-end
orchestrate_export path proving a colonies/<id>.json declaration survives a real export -- and
that a malformed list is refused at export, by QA, not discovered later by the app.
Mirrors test_export_backdrop.py's shape (and its reason for being its own file: invariant 7's
250-line cap).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import ezdxf
import pytest

from pipeline.derive.corner import is_plot_corner
from pipeline.derive.facing import resolve_facing
from pipeline.derive.roads import derive_road
from pipeline.export import ExportError
from pipeline.export.manifest import build_manifest
from pipeline.export.normalise import compute_transform
from pipeline.export.run import orchestrate_export
from pipeline.extract.types import ColonyConfig, Label, Ring
from pipeline.matching.assign import MatchedPlot

_STATUSES: list[dict[str, Any]] = [
    {"key": "available", "label": "Available", "colour": "#e8b84b"},
    {"key": "booked", "label": "Booked", "colour": "#3b82f6"},
    {"key": "registered", "label": "Registry done", "colour": "#ff145a"},
    {"key": "sold_to_investors", "label": "Sold to investors", "colour": "#9333ea"},
]

_CONFIG_FIELDS: dict[str, Any] = {
    "id": "test-colony",
    "name": "Test Colony",
    "units": "ft",
    "expected_plots": 1,
    "blocks": ["A"],
    "number_width": 2,
    "number_range": [1, 60],
    "north_deg": 0.0,
    "source": {"file": "test.dwg", "revision": "n/a", "plan_date": "2026-01-01", "method": "dxf"},
}

_SITE = Ring(layer="COL-SITE", handle="S1", points=((0, 0), (200, 0), (200, 100), (0, 100)))
_PLOT_RING = Ring(layer="COL-PLOT", handle="P1", points=((0, 70), (20, 70), (20, 100), (0, 100)))
_PLOT_LABEL = Label(
    layer="COL-PLOT-NO", handle="L1", text="1", point=(10, 85), rotation_deg=0.0, height=None
)
_PLOT = MatchedPlot(ring=_PLOT_RING, label=_PLOT_LABEL, svg_id="plot-A-01", block="A", number="01")


def _config(statuses: list[dict[str, Any]] | None) -> ColonyConfig:
    return ColonyConfig(
        id="test-colony",
        name="Test Colony",
        units="ft",
        expected_plots=1,
        blocks=("A",),
        default_block="A",
        number_width=2,
        number_range=(1, 60),
        north_deg=0.0,
        source=_CONFIG_FIELDS["source"],
        statuses=statuses,
    )


def _build_manifest(config: ColonyConfig) -> dict[str, Any]:
    road = derive_road(_SITE, [_PLOT_RING])
    t = compute_transform(_SITE)
    facings = {_PLOT.svg_id: resolve_facing(_PLOT.ring, road, 0.0)}
    corners = {_PLOT.svg_id: is_plot_corner(_PLOT.ring, road)}
    return build_manifest(config, t, [_PLOT], [], 0.0, facings, corners)


def test_manifest_has_no_statuses_key_without_one_in_config() -> None:
    assert "statuses" not in _build_manifest(_config(None))["colony"]


def test_manifest_includes_statuses_verbatim_when_config_has_them() -> None:
    assert _build_manifest(_config(_STATUSES))["colony"]["statuses"] == _STATUSES


def _write_inputs(tmp_path: Path, statuses: list[dict[str, Any]] | None) -> tuple[Path, Path]:
    doc = ezdxf.new("R2013")
    for name in ("COL-SITE", "COL-PLOT", "COL-PLOT-NO", "COL-GARDEN", "COL-AMENITY",
                 "COL-WATER", "COL-FEATURE-NO", "COL-NORTH", "COL-ZOOM-REF"):
        doc.layers.add(name)
    msp = doc.modelspace()
    msp.add_lwpolyline(list(_SITE.points), close=True, dxfattribs={"layer": "COL-SITE"})
    msp.add_lwpolyline(list(_PLOT_RING.points), close=True, dxfattribs={"layer": "COL-PLOT"})
    msp.add_text(_PLOT_LABEL.text, dxfattribs={"layer": "COL-PLOT-NO", "insert": _PLOT_LABEL.point})
    dxf_path = tmp_path / "colony.dxf"
    doc.saveas(dxf_path)

    colonies_dir = tmp_path / "colonies"
    colonies_dir.mkdir()
    data = dict(_CONFIG_FIELDS)
    if statuses is not None:
        data["statuses"] = statuses
    (colonies_dir / "test-colony.json").write_text(json.dumps(data))
    return dxf_path, colonies_dir


def test_orchestrate_export_writes_statuses_from_colony_config(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _write_inputs(tmp_path, _STATUSES)
    out_dir = tmp_path / "out"

    orchestrate_export("test-colony", dxf_path, colonies_dir, out_dir)

    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    assert manifest["colony"]["statuses"] == _STATUSES


def test_orchestrate_export_omits_statuses_without_one_in_colony_config(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _write_inputs(tmp_path, None)
    out_dir = tmp_path / "out"

    orchestrate_export("test-colony", dxf_path, colonies_dir, out_dir)

    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    assert "statuses" not in manifest["colony"]


def _nine() -> list[dict[str, Any]]:
    return [{"key": "available", "label": "A", "colour": "#000000"}] + [
        {"key": f"s{i}", "label": f"S{i}", "colour": "#111111"} for i in range(8)
    ]


@pytest.mark.parametrize(
    ("statuses", "message"),
    [
        (
            [*_STATUSES, {"key": "booked", "label": "Booked again", "colour": "#123456"}],
            "repeats key",
        ),
        ([s for s in _STATUSES if s["key"] != "available"], "does not match"),
        (_nine(), "does not match"),
        (
            [{"key": "available", "label": "Available", "colour": "red"}],
            "does not match",
        ),
        (
            [{"key": "available", "label": "Available", "colour": "#e8b84b", "extra": 1}],
            "does not match",
        ),
        (
            [{"key": "Available", "label": "Available", "colour": "#e8b84b"}],
            "does not match",
        ),
        ([], "does not match"),
    ],
    ids=[
        "duplicate-key",
        "no-available",
        "nine-entries",
        "bad-colour",
        "extra-field",
        "uppercase-key",
        "empty-list",
    ],
)
def test_orchestrate_export_refuses_a_malformed_statuses_list(
    tmp_path: Path, statuses: list[dict[str, Any]], message: str
) -> None:
    dxf_path, colonies_dir = _write_inputs(tmp_path, statuses)
    out_dir = tmp_path / "out"

    with pytest.raises(ExportError, match=message):
        orchestrate_export("test-colony", dxf_path, colonies_dir, out_dir)

    assert not (out_dir / "colony.json").exists()  # a refused export writes nothing
