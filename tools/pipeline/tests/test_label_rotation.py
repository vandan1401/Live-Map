"""`Label.rotation_deg`/`height` extraction (docs/plans/17.md, 2026-08-21) -- the CAD
operator's own choice of how each plot-number label sits, read straight off the source
entity rather than derived. Split out of test_dxf.py (already near the 250-line cap)
rather than grown into it, same split-file precedent as test_svg_labels.py.

The MTEXT direction-vector case is the real regression: found on Jai Dev Residency
(2026-08-21) that every one of 675 real labels encodes rotation as a `text_direction`
vector, not the plain `rotation` attribute -- `entity.dxf.rotation` alone silently reads
0 for all of them. get_rotation() is what resolves either form; a naive `.dxf.rotation`
read would pass every test here except this one.
"""

from __future__ import annotations

from pathlib import Path

import ezdxf
from ezdxf.document import Drawing

from pipeline.extract.dxf import ingest_dxf
from pipeline.extract.types import ColonyConfig

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


def _new_doc() -> Drawing:
    doc = ezdxf.new("R2013")
    for name in ("COL-SITE", "COL-PLOT", "COL-PLOT-NO"):
        doc.layers.add(name)
    return doc


def _add_site_and_plot(doc: Drawing) -> None:
    doc.modelspace().add_lwpolyline(
        [(0, 0), (100, 0), (100, 100), (0, 100)], close=True, dxfattribs={"layer": "COL-SITE"}
    )
    doc.modelspace().add_lwpolyline(
        [(10, 10), (20, 10), (20, 20), (10, 20)], close=True, dxfattribs={"layer": "COL-PLOT"}
    )


def _save(doc: Drawing, tmp_path: Path) -> Path:
    path = tmp_path / "colony.dxf"
    doc.saveas(path)
    return path


def test_text_entity_reads_plain_rotation_and_height(tmp_path: Path) -> None:
    doc = _new_doc()
    _add_site_and_plot(doc)
    doc.modelspace().add_text(
        "7", dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15), "rotation": 30.0, "height": 4.0}
    )
    result = ingest_dxf(_save(doc, tmp_path), _CONFIG)
    assert result.labels[0].rotation_deg == 30.0
    assert result.labels[0].height == 4.0


def test_mtext_reads_plain_rotation_attribute(tmp_path: Path) -> None:
    doc = _new_doc()
    _add_site_and_plot(doc)
    doc.modelspace().add_mtext(
        "7", dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15, 0), "rotation": 45.0, "char_height": 5.0}
    )
    result = ingest_dxf(_save(doc, tmp_path), _CONFIG)
    assert result.labels[0].rotation_deg == 45.0
    assert result.labels[0].height == 5.0


def test_mtext_reads_rotation_from_text_direction_vector(tmp_path: Path) -> None:
    """The real bug: found on Jai Dev Residency, every real label uses this form, and a
    naive `.dxf.rotation` read silently returns 0.0 for every single one of them."""
    doc = _new_doc()
    _add_site_and_plot(doc)
    doc.modelspace().add_mtext(
        "7",
        dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15, 0), "text_direction": (0, 1, 0), "char_height": 5.0},
    )
    result = ingest_dxf(_save(doc, tmp_path), _CONFIG)
    assert result.labels[0].rotation_deg == 90.0


def test_label_with_no_rotation_defaults_to_zero(tmp_path: Path) -> None:
    """`height` is a mandatory DXF field (TEXT's group code 40) -- ezdxf materialises its
    own schema default (2.5) for it on a real file round-trip even when never set, so
    `Label.height` is only ever `None` for a genuinely malformed/older file a real reader
    might still let through. `height: float | None` stays the honest type either way."""
    doc = _new_doc()
    _add_site_and_plot(doc)
    doc.modelspace().add_text("7", dxfattribs={"layer": "COL-PLOT-NO", "insert": (15, 15)})
    result = ingest_dxf(_save(doc, tmp_path), _CONFIG)
    assert result.labels[0].rotation_deg == 0.0
    assert result.labels[0].height == 2.5
