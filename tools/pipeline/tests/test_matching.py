"""M12 -- identity and classification (spec/12-pipe-matching.md, docs/plans/13.md).

`fixtures/shree-vatika-2/colony.dxf` still doesn't exist (the owner hasn't produced it, same
blocker as M10/M11's own golden criteria), so criteria 1-2 are adapted the same way: synthetic
`Ring`/`Label` pairs built directly from the fixture manifest's own `number`/`centroid` fields,
not a live DXF-to-matching run. Everything else is covered against small synthetic data, the
same in-memory-construction convention as tests/test_dxf.py and tests/test_geom.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.extract.types import ColonyConfig, Label, Ring
from pipeline.matching import MatchingError
from pipeline.matching.assign import assign_plot_numbers
from pipeline.matching.classify import classify_features

REPO_ROOT = Path(__file__).resolve().parents[3]

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


def _square_ring(handle: str, layer: str, center: tuple[float, float], half: float = 5.0) -> Ring:
    x, y = center
    return Ring(
        layer=layer,
        handle=handle,
        points=(
            (x - half, y - half),
            (x + half, y - half),
            (x + half, y + half),
            (x - half, y + half),
        ),
    )


def _label(handle: str, layer: str, text: str, point: tuple[float, float]) -> Label:
    return Label(layer=layer, handle=handle, text=text, point=point)


# -- criteria 1-2 (adapted): the golden fixture, reproduced synthetically -------------------


def test_reproduces_every_fixture_plot_id() -> None:
    manifest = json.loads((REPO_ROOT / "fixtures" / "shree-vatika-2" / "colony.json").read_text())
    config = _config(blocks=("A",), number_width=2, number_range=(1, 60))

    rings = [
        _square_ring(f"h{i}", "COL-PLOT", tuple(p["centroid"]))
        for i, p in enumerate(manifest["plots"])
    ]
    labels = [
        _label(f"l{i}", "COL-PLOT-NO", p["number"].lstrip("0") or "0", tuple(p["centroid"]))
        for i, p in enumerate(manifest["plots"])
    ]

    result = assign_plot_numbers(rings, labels, config)

    assert {plot.svg_id for plot in result.plots} == {p["svg_id"] for p in manifest["plots"]}


# -- containment errors (criteria 3-5) -------------------------------------------------------


def test_label_outside_every_plot_is_an_error_naming_its_handle() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "1", (100, 100))

    with pytest.raises(MatchingError, match="hLABEL"):
        assign_plot_numbers([ring], [label], _config())


def test_two_labels_in_one_plot_is_an_error_naming_both_handles() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label_a = _label("hA", "COL-PLOT-NO", "1", (-1, 0))
    label_b = _label("hB", "COL-PLOT-NO", "2", (1, 0))

    with pytest.raises(MatchingError, match="hA.*hB|hB.*hA"):
        assign_plot_numbers([ring], [label_a, label_b], _config())


def test_plot_with_no_label_is_an_error() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))

    with pytest.raises(MatchingError, match="hRING"):
        assign_plot_numbers([ring], [], _config())


# -- duplicate numbers (criterion 6) ---------------------------------------------------------


def test_duplicate_plot_numbers_on_two_plots_is_an_error() -> None:
    ring_a = _square_ring("hA", "COL-PLOT", (0, 0))
    ring_b = _square_ring("hB", "COL-PLOT", (100, 0))
    label_a = _label("lA", "COL-PLOT-NO", "7", (0, 0))
    label_b = _label("lB", "COL-PLOT-NO", "7", (100, 0))

    with pytest.raises(MatchingError, match="hA.*hB|hB.*hA"):
        assign_plot_numbers([ring_a, ring_b], [label_a, label_b], _config())


# -- dimension strings never become plot numbers (criterion 7) -------------------------------


@pytest.mark.parametrize("text", ["12.5M", "7A"])
def test_dimension_string_is_never_a_plot_number(text: str) -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", text, (0, 0))

    with pytest.raises(MatchingError, match="hLABEL"):
        assign_plot_numbers([ring], [label], _config())


# -- block resolution and padding (criteria 8-12) ---------------------------------------------


def test_bare_number_takes_the_default_block_and_pads() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "7", (0, 0))

    result = assign_plot_numbers([ring], [label], _config(blocks=("A",), number_width=2))

    assert result.plots[0].svg_id == "plot-A-07"
    assert result.default_block_count == 1
    assert result.explicit_block_count == 0


def test_explicit_prefix_in_blocks_resolves_to_that_block() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "B-7", (0, 0))

    result = assign_plot_numbers(
        [ring], [label], _config(blocks=("A", "B"), number_width=2)
    )

    assert result.plots[0].svg_id == "plot-B-07"
    assert result.explicit_block_count == 1
    assert result.default_block_count == 0


def test_explicit_prefix_not_in_blocks_is_an_error() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "B-7", (0, 0))

    with pytest.raises(MatchingError, match="hLABEL"):
        assign_plot_numbers([ring], [label], _config(blocks=("A",), number_width=2))


def test_number_exceeding_number_width_is_an_error_not_a_wider_pad() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "100", (0, 0))

    with pytest.raises(MatchingError, match="hLABEL"):
        assign_plot_numbers(
            [ring], [label], _config(blocks=("A",), number_width=2, number_range=(1, 200))
        )


def test_number_outside_number_range_is_an_error() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "170", (0, 0))

    with pytest.raises(MatchingError, match="hLABEL"):
        assign_plot_numbers([ring], [label], _config(number_range=(1, 60)))


def test_bare_numbered_ids_sort_in_numeric_order_as_strings() -> None:
    rings = [
        _square_ring("h2", "COL-PLOT", (0, 0)),
        _square_ring("h10", "COL-PLOT", (100, 0)),
        _square_ring("h11", "COL-PLOT", (200, 0)),
    ]
    labels = [
        _label("l2", "COL-PLOT-NO", "2", (0, 0)),
        _label("l10", "COL-PLOT-NO", "10", (100, 0)),
        _label("l11", "COL-PLOT-NO", "11", (200, 0)),
    ]

    result = assign_plot_numbers(rings, labels, _config(number_range=(1, 60)))

    ids_by_input_order = [plot.svg_id for plot in result.plots]
    assert sorted(ids_by_input_order) == ["plot-A-02", "plot-A-10", "plot-A-11"]


# -- classification (criterion 13) -----------------------------------------------------------


def test_amenity_labelled_clubhouse_classifies_correctly() -> None:
    ring = _square_ring("hRING", "COL-AMENITY", (0, 0))
    label = _label("hLABEL", "COL-FEATURE-NO", "CLUB HOUSE", (0, 0))

    features = classify_features([ring], [label])

    assert features[0].feature_class == "amenity"
    assert features[0].kind == "clubhouse"


def test_amenity_label_matching_no_keyword_is_an_error() -> None:
    ring = _square_ring("hRING", "COL-AMENITY", (0, 0))
    label = _label("hLABEL", "COL-FEATURE-NO", "XYZ", (0, 0))

    with pytest.raises(MatchingError, match="hLABEL"):
        classify_features([ring], [label])


# docs/cad-layer-standard.md's keyword table, one text per keyword group -- every one of
# these is a distinct row so a reordering/substring collision (like PARKING/PARK, found by
# /review 2026-08-20) shows up as one specific failing case, not a single combined test.
@pytest.mark.parametrize(
    ("text", "expected_kind"),
    [
        ("CLUB HOUSE", "clubhouse"),
        ("COMMUNITY HALL", "clubhouse"),
        ("PARKING", "parking"),
        ("CAR PARKING", "parking"),
        ("GARDEN", "park"),
        ("PARK", "park"),
        ("OPEN SPACE", "park"),
        ("GREEN", "park"),
        ("TEMPLE", "temple"),
        ("MANDIR", "temple"),
        ("OHT", "tank"),
        ("TANK", "tank"),
        ("SUMP", "tank"),
        ("RESERVED", "reserved"),
        ("OTHER", "other"),
    ],
)
def test_every_keyword_group_resolves_to_its_kind(text: str, expected_kind: str) -> None:
    ring = _square_ring("hRING", "COL-AMENITY", (0, 0))
    label = _label("hLABEL", "COL-FEATURE-NO", text, (0, 0))

    features = classify_features([ring], [label])

    assert features[0].kind == expected_kind


def test_keyword_table_kinds_are_all_valid_schema_values() -> None:
    from pipeline.matching.classify import _KEYWORD_TABLE

    schema = json.loads((REPO_ROOT / "contract" / "colony.schema.json").read_text())
    allowed = set(schema["properties"]["features"]["items"]["properties"]["kind"]["enum"])

    table_kinds = {kind for _, kind in _KEYWORD_TABLE}
    assert table_kinds <= allowed
