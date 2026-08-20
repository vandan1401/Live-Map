"""M13 -- export: normalise, svg, manifest, qa, orchestration (spec/13-pipe-derive-export.md,
docs/plans/14.md). `fixtures/shree-vatika-2/colony.dxf` still doesn't exist (same blocker as
M10/M11/M12), so criteria 2-3 (the golden fixture) are adapted: a small synthetic colony,
matching tests/test_matching.py's in-memory-construction convention, with hand-computed
expected values. `fixtures/shree-vatika-2/colony.svg` is hand-traced, not pipeline-generated
(its own manifest says so) -- it is not this module's target either. Orchestration tests
(`orchestrate_export`) build a synthetic in-memory DXF with ezdxf, the same convention as
tests/test_dxf.py.
"""

from __future__ import annotations

import copy
import json
import re
from datetime import UTC, date, datetime
from pathlib import Path

import ezdxf
import pytest
from shapely.geometry import Polygon

from pipeline.derive.corner import is_plot_corner
from pipeline.derive.facing import resolve_facing
from pipeline.derive.roads import derive_road
from pipeline.derive.trees import scatter_trees
from pipeline.export import ExportError
from pipeline.export.manifest import build_manifest
from pipeline.export.normalise import apply_transform, compute_transform
from pipeline.export.qa import run_qa
from pipeline.export.run import orchestrate_export
from pipeline.export.svg import build_svg
from pipeline.extract.types import ColonyConfig, Label, Ring
from pipeline.matching.assign import MatchedPlot
from pipeline.matching.classify import ClassifiedFeature

_CONFIG = ColonyConfig(
    id="test-colony",
    name="Test Colony",
    units="ft",
    expected_plots=1,
    blocks=("A",),
    number_width=2,
    number_range=(1, 60),
    north_deg=0.0,
    source={"file": "test.dwg", "revision": "n/a", "plan_date": "2026-01-01", "method": "dxf"},
)

_SITE = Ring(layer="COL-SITE", handle="S1", points=((0, 0), (200, 0), (200, 100), (0, 100)))
_PLOT_RING = Ring(layer="COL-PLOT", handle="P1", points=((0, 70), (20, 70), (20, 100), (0, 100)))
_PLOT_LABEL = Label(layer="COL-PLOT-NO", handle="L1", text="1", point=(10, 85))
_PLOT = MatchedPlot(ring=_PLOT_RING, label=_PLOT_LABEL, svg_id="plot-A-01", block="A", number="01")

_GARDEN_RING = Ring(
    layer="COL-GARDEN", handle="G1", points=((150, 10), (180, 10), (180, 40), (150, 40))
)
_GARDEN_LABEL = Label(layer="COL-FEATURE-NO", handle="GL1", text="Garden", point=(165, 25))
_FEATURE = ClassifiedFeature(
    ring=_GARDEN_RING, label=_GARDEN_LABEL, feature_class="garden", kind="park"
)


def _manifest() -> dict:
    road = derive_road(_SITE, [_PLOT_RING, _GARDEN_RING])
    t = compute_transform(_SITE)
    facings = {_PLOT.svg_id: resolve_facing(_PLOT.ring, road, 0.0)}
    corners = {_PLOT.svg_id: is_plot_corner(_PLOT.ring, road)}
    return build_manifest(_CONFIG, t, [_PLOT], [_FEATURE], 0.0, facings, corners)


def _svg() -> str:
    road = derive_road(_SITE, [_PLOT_RING, _GARDEN_RING])
    t = compute_transform(_SITE)
    return build_svg(t, _SITE, road, [_PLOT], [_FEATURE], (), "test-colony")


def _build_export_dxf(tmp_path: Path) -> tuple[Path, Path]:
    """A minimal conforming DXF (site + one plot, matching _SITE/_PLOT_RING/_PLOT_LABEL
    exactly) plus its colony config, for exercising orchestrate_export end to end -- the
    same synthetic-DXF convention as tests/test_dxf.py."""
    doc = ezdxf.new("R2013")
    for name in ("COL-SITE", "COL-PLOT", "COL-PLOT-NO", "COL-GARDEN", "COL-AMENITY",
                 "COL-WATER", "COL-FEATURE-NO", "COL-NORTH"):
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


def test_manifest_reproduces_expected_plot_and_feature_fields() -> None:
    manifest = _manifest()

    plot = manifest["plots"][0]
    assert plot["svg_id"] == "plot-A-01"
    assert plot["area_sqft"] == 600
    assert plot["length_ft"] == 20.0
    assert plot["breadth_ft"] == 30.0
    assert plot["centroid"] == [50.0, 75.0]
    assert plot["facing"] == "east"
    assert plot["is_corner"] is True
    assert plot["confidence"] == "manual"

    feature = manifest["features"][0]
    assert feature["svg_id"] == "garden-g1"
    assert feature["class"] == "garden"
    assert feature["kind"] == "park"
    assert feature["label"] == "Garden"
    assert feature["centroid"] == [825.0, 375.0]
    assert feature["area_sqft"] == 900


def test_manifest_colony_block() -> None:
    manifest = _manifest()
    colony = manifest["colony"]

    assert colony["viewbox"] == [0, 0, 1000, 500.0]
    assert colony["scale"]["px_per_ft"] == 5.0
    assert colony["north_deg"] == 0.0
    assert date.fromisoformat(colony["generated"]) == datetime.now(tz=UTC).date()
    assert colony["verified"] is False  # D-108, invariant 2: hardcoded, no exception
    assert colony["source"] == _CONFIG.source


def test_y_flip_is_correct() -> None:
    t = compute_transform(_SITE)
    # (x, max_y) is the "top" of the drawing (CAD counts up) -> must land near svg y=0.
    _, y_top = apply_transform(t, (0, 100))
    _, y_bottom = apply_transform(t, (0, 0))
    assert y_top == 0.0
    assert y_bottom == t.height_px


def test_svg_has_zero_styling_attributes() -> None:
    assert re.search(r"(fill|stroke|style)=", _svg()) is None


def test_two_clean_runs_are_byte_identical() -> None:
    road = derive_road(_SITE, [_PLOT_RING, _GARDEN_RING])
    t = compute_transform(_SITE)
    areas = [("road", road), ("garden", Polygon(_GARDEN_RING.points))]

    trees_1 = scatter_trees("test-colony", areas)
    trees_2 = scatter_trees("test-colony", areas)
    assert trees_1 == trees_2
    assert trees_1  # sanity: the seeded scatter actually produced something to compare

    svg_1 = build_svg(t, _SITE, road, [_PLOT], [_FEATURE], trees_1, "test-colony")
    svg_2 = build_svg(t, _SITE, road, [_PLOT], [_FEATURE], trees_2, "test-colony")
    assert svg_1 == svg_2

    manifest_1 = _manifest()
    manifest_2 = _manifest()
    assert manifest_1 == manifest_2


def test_duplicate_id_across_plots_and_features_blocks_export(tmp_path: Path) -> None:
    manifest = _manifest()
    manifest["features"][0]["svg_id"] = manifest["plots"][0]["svg_id"]

    with pytest.raises(ExportError, match="duplicate"):
        run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=False)


def test_area_far_outside_sane_band_blocks_export(tmp_path: Path) -> None:
    manifest = _manifest()
    manifest["plots"][0]["area_sqft"] = 4  # a units mismatch, not a real plot

    with pytest.raises(ExportError, match="sane band"):
        run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=False)


def test_number_wider_than_number_width_blocks_export(tmp_path: Path) -> None:
    manifest = _manifest()
    manifest["plots"][0]["number"] = "100"  # number_width is 2

    with pytest.raises(ExportError, match="number_width"):
        run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=False)


def test_styling_attribute_in_svg_blocks_export(tmp_path: Path) -> None:
    manifest = _manifest()
    doctored_svg = _svg().replace('class="plot"', 'class="plot" fill="red"')

    with pytest.raises(ExportError, match="styling attribute"):
        run_qa(manifest, [_PLOT], _CONFIG, doctored_svg, tmp_path, allow_id_change=False)


def test_manifest_violating_schema_blocks_export(tmp_path: Path) -> None:
    manifest = _manifest()
    manifest["plots"][0]["facing"] = "sideways"  # not in the schema's facing enum

    with pytest.raises(ExportError, match="colony.schema.json"):
        run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=False)


def test_dropping_a_previous_svg_id_blocks_export_without_allow_id_change(
    tmp_path: Path,
) -> None:
    manifest = _manifest()
    previous = copy.deepcopy(manifest)
    previous["plots"].append({**previous["plots"][0], "svg_id": "plot-A-02"})
    (tmp_path / "colony.json").write_text(json.dumps(previous))

    with pytest.raises(ExportError, match="allow-id-change"):
        run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=False)

    run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=True)  # no raise


def test_valid_manifest_passes_qa(tmp_path: Path) -> None:
    manifest = _manifest()
    run_qa(manifest, [_PLOT], _CONFIG, _svg(), tmp_path, allow_id_change=False)  # no raise


def test_orchestrate_export_writes_a_manifest_matching_the_dxf(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path)
    out_dir = tmp_path / "out"

    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)

    assert (out_dir / "colony.svg").exists()
    manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    plot = manifest["plots"][0]
    assert plot["svg_id"] == "plot-A-01"
    assert plot["area_sqft"] == 600
    assert plot["facing"] == "east"
    assert plot["is_corner"] is True


def test_orchestrate_export_is_idempotent_including_tree_positions(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path)

    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, tmp_path / "out1")
    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, tmp_path / "out2")

    svg_1 = (tmp_path / "out1" / "colony.svg").read_text(encoding="utf-8")
    svg_2 = (tmp_path / "out2" / "colony.svg").read_text(encoding="utf-8")
    assert svg_1 == svg_2
    assert '<use class="tree"' in svg_1  # sanity: the seeded scatter produced real trees


def test_orchestrate_export_leaves_out_dir_untouched_on_qa_failure(tmp_path: Path) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path)
    # A config declaring 2 expected plots against a DXF with only 1 plot -- a real QA
    # failure reached through the full orchestration, not a hand-crafted manifest.
    bad_config = json.loads((colonies_dir / f"{_CONFIG.id}.json").read_text())
    bad_config["id"] = "bad-colony"
    bad_config["expected_plots"] = 2
    (colonies_dir / "bad-colony.json").write_text(json.dumps(bad_config))
    out_dir = tmp_path / "out"

    with pytest.raises(ExportError, match="expected_plots"):
        orchestrate_export("bad-colony", dxf_path, colonies_dir, out_dir)

    assert not out_dir.exists()  # neither file was ever written


def test_orchestrate_export_does_not_touch_existing_files_on_a_failed_rerun(
    tmp_path: Path,
) -> None:
    dxf_path, colonies_dir = _build_export_dxf(tmp_path)
    out_dir = tmp_path / "out"
    orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)
    svg_before = (out_dir / "colony.svg").read_text(encoding="utf-8")

    # Corrupt the previous manifest so a rerun's id-stability check is guaranteed to fail.
    stale_manifest = json.loads((out_dir / "colony.json").read_text(encoding="utf-8"))
    stale_manifest["plots"][0]["svg_id"] = "plot-A-02"
    corrupted = json.dumps(stale_manifest)
    (out_dir / "colony.json").write_text(corrupted, encoding="utf-8")

    with pytest.raises(ExportError, match="allow-id-change"):
        orchestrate_export(_CONFIG.id, dxf_path, colonies_dir, out_dir)

    assert (out_dir / "colony.svg").read_text(encoding="utf-8") == svg_before
    assert (out_dir / "colony.json").read_text(encoding="utf-8") == corrupted
