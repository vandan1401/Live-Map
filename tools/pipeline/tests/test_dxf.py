"""M10 — DXF ingest (spec/10-pipe-ingest.md).

`fixtures/shree-vatika-2/colony.dxf` does not exist yet (the owner hasn't produced it —
spec/10's own "Depends on" section), so criteria 1-2 (the golden fixture) cannot run here.
Everything else — the synthetic-error and unit criteria — is covered against small DXFs
built in-memory with ezdxf, the same way test_pdf_io.py builds synthetic PDFs with pymupdf.
"""

from __future__ import annotations

from pathlib import Path

import ezdxf
import pytest
from ezdxf.document import Drawing

from pipeline.extract.dxf import DxfConformanceError, ingest_dxf, load_colony_config
from pipeline.extract.types import ColonyConfig

_STANDARD_LAYERS = (
    "COL-SITE",
    "COL-PLOT",
    "COL-PLOT-NO",
    "COL-GARDEN",
    "COL-AMENITY",
    "COL-WATER",
    "COL-FEATURE-NO",
    "COL-NORTH",
)

_CONFIG = ColonyConfig(
    id="test-colony",
    name="Test Colony",
    units="ft",
    expected_plots=1,
    blocks=("A",),
    number_width=2,
    number_range=(1, 60),
    north_deg=None,
    source={"file": "test.dwg", "revision": "n/a", "plan_date": "2026-01-01", "method": "dxf"},
)


def _config(**overrides: object) -> ColonyConfig:
    return ColonyConfig(**{**_CONFIG.__dict__, **overrides})


def _new_doc() -> Drawing:
    doc = ezdxf.new("R2013")
    for name in _STANDARD_LAYERS:
        doc.layers.add(name)
    return doc


def _add_site(doc: Drawing) -> None:
    doc.modelspace().add_lwpolyline(
        [(0, 0), (100, 0), (100, 100), (0, 100)], close=True, dxfattribs={"layer": "COL-SITE"}
    )


def _add_plot(doc: Drawing, number: str, origin: tuple[float, float] = (10, 10)) -> None:
    x, y = origin
    doc.modelspace().add_lwpolyline(
        [(x, y), (x + 10, y), (x + 10, y + 10), (x, y + 10)],
        close=True,
        dxfattribs={"layer": "COL-PLOT"},
    )
    doc.modelspace().add_text(
        number, dxfattribs={"layer": "COL-PLOT-NO", "insert": (x + 5, y + 5)}
    )


def _add_north_line(doc: Drawing, bearing_deg: float) -> None:
    import math

    dx = math.sin(math.radians(bearing_deg))
    dy = math.cos(math.radians(bearing_deg))
    doc.modelspace().add_line((0, 0), (dx, dy), dxfattribs={"layer": "COL-NORTH"})


def _save(doc: Drawing, tmp_path: Path, name: str = "colony.dxf") -> Path:
    path = tmp_path / name
    doc.saveas(path)
    return path


def _minimal_valid_doc() -> Drawing:
    doc = _new_doc()
    _add_site(doc)
    _add_plot(doc, "7")
    return doc


def test_load_colony_config_missing_file_errors(tmp_path: Path) -> None:
    with pytest.raises(DxfConformanceError):
        load_colony_config("nope", tmp_path)


def test_load_colony_config_missing_field_errors(tmp_path: Path) -> None:
    (tmp_path / "bad.json").write_text('{"id": "bad"}')
    with pytest.raises(DxfConformanceError):
        load_colony_config("bad", tmp_path)


def test_intermediate_types_do_not_need_ezdxf() -> None:
    """M10's neutral structure must be importable/usable with no ezdxf types crossing it
    (spec/10 criterion 7) — asserted here since pipeline.geom (M11) doesn't exist yet to
    carry this test itself."""
    import ast
    import inspect

    from pipeline.extract import types as types_module

    source = inspect.getsource(types_module)
    tree = ast.parse(source)
    imported_names = {
        alias.name.split(".")[0]
        for node in ast.walk(tree)
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    }
    assert "ezdxf" not in imported_names


def test_open_polyline_on_plot_layer_rejected_with_handle(tmp_path: Path) -> None:
    doc = _new_doc()
    _add_site(doc)
    entity = doc.modelspace().add_lwpolyline(
        [(10, 10), (20, 10), (20, 20), (10, 20)], dxfattribs={"layer": "COL-PLOT"}
    )
    doc.modelspace().add_text("7", dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15)})
    path = _save(doc, tmp_path)

    with pytest.raises(DxfConformanceError) as exc_info:
        ingest_dxf(path, _config())
    assert entity.dxf.handle in str(exc_info.value)


def test_circle_on_plot_layer_rejected(tmp_path: Path) -> None:
    doc = _new_doc()
    _add_site(doc)
    doc.modelspace().add_circle((15, 15), 5, dxfattribs={"layer": "COL-PLOT"})
    path = _save(doc, tmp_path)

    with pytest.raises(DxfConformanceError):
        ingest_dxf(path, _config())


def test_two_entities_on_site_layer_rejected(tmp_path: Path) -> None:
    doc = _new_doc()
    _add_site(doc)
    _add_site(doc)
    _add_plot(doc, "7")
    path = _save(doc, tmp_path)

    with pytest.raises(DxfConformanceError):
        ingest_dxf(path, _config())


def test_dimension_and_title_block_layers_ignored(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    doc.layers.add("DIMENSIONS")
    doc.layers.add("TITLE-BLOCK")
    doc.modelspace().add_line((0, 0), (10, 10), dxfattribs={"layer": "DIMENSIONS"})
    doc.modelspace().add_text("Shree Vatika", dxfattribs={"layer": "TITLE-BLOCK"})
    path = _save(doc, tmp_path)

    result = ingest_dxf(path, _config(north_deg=0.0))
    assert len(result.rings) == 2  # site + one plot
    assert len(result.labels) == 1


def test_north_line_30_deg_east_of_vertical_reads_30(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    _add_north_line(doc, 30.0)
    path = _save(doc, tmp_path)

    result = ingest_dxf(path, _config())
    assert result.north_deg == pytest.approx(30.0, abs=0.01)


def test_no_north_line_and_no_config_north_deg_errors(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    path = _save(doc, tmp_path)

    with pytest.raises(DxfConformanceError):
        ingest_dxf(path, _config(north_deg=None))


def test_north_line_alone_succeeds(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    _add_north_line(doc, 12.0)
    path = _save(doc, tmp_path)

    result = ingest_dxf(path, _config(north_deg=None))
    assert result.north_deg == pytest.approx(12.0, abs=0.01)


def test_config_north_deg_alone_succeeds(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    path = _save(doc, tmp_path)

    result = ingest_dxf(path, _config(north_deg=45.0))
    assert result.north_deg == pytest.approx(45.0, abs=0.01)


def test_north_line_disagreeing_with_config_by_5_deg_errors(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    _add_north_line(doc, 30.0)
    path = _save(doc, tmp_path)

    with pytest.raises(DxfConformanceError):
        ingest_dxf(path, _config(north_deg=35.0))


def test_north_line_agreeing_within_1_deg_succeeds(tmp_path: Path) -> None:
    doc = _minimal_valid_doc()
    _add_north_line(doc, 30.0)
    path = _save(doc, tmp_path)

    result = ingest_dxf(path, _config(north_deg=30.5))
    assert result.north_deg == pytest.approx(30.0, abs=0.01)


def test_mtext_formatting_codes_stripped_from_plot_label(tmp_path: Path) -> None:
    doc = _new_doc()
    _add_site(doc)
    doc.modelspace().add_lwpolyline(
        [(10, 10), (20, 10), (20, 20), (10, 20)], close=True, dxfattribs={"layer": "COL-PLOT"}
    )
    doc.modelspace().add_mtext(
        r"\pxqc;7", dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15)}
    )
    path = _save(doc, tmp_path)

    result = ingest_dxf(path, _config(north_deg=0.0))
    assert result.labels[0].text == "7"
