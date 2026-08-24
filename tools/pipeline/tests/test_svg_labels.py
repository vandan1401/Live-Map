"""docs/plans/16.md -- plot-label text must disambiguate a blockless plot from a lettered
one sharing the same padded number (the Jai Dev Residency shape, PROGRESS.md Deferred).
Split out of test_export.py, which is already over the 250-line cap (invariant 7) -- same
split-file precedent as test_matching_blockless.py.
"""

from __future__ import annotations

import re

from pipeline.derive.roads import derive_road
from pipeline.export.normalise import compute_transform
from pipeline.export.svg import build_svg
from pipeline.extract.types import Label, Ring
from pipeline.matching.assign import MatchedPlot
from pipeline.matching.classify import ClassifiedFeature

_SITE = Ring(layer="COL-SITE", handle="S1", points=((0, 0), (200, 0), (200, 100), (0, 100)))


def _plot(
    handle: str,
    svg_id: str,
    block: str,
    number: str,
    x0: float,
    rotation_deg: float = 0.0,
    height: float | None = None,
) -> MatchedPlot:
    ring = Ring(
        layer="COL-PLOT",
        handle=handle,
        points=((x0, 0), (x0 + 10, 0), (x0 + 10, 10), (x0, 10)),
    )
    label = Label(
        layer="COL-PLOT-NO",
        handle=f"{handle}L",
        text=number,
        point=(x0 + 5, 5),
        rotation_deg=rotation_deg,
        height=height,
    )
    return MatchedPlot(ring=ring, label=label, svg_id=svg_id, block=block, number=number)


def _label_texts(svg: str) -> list[str]:
    return re.findall(r'class="plot-label"[^>]*>([^<]+)<', svg)


def _label_attr(svg: str, attr: str) -> str | None:
    m = re.search(rf'class="plot-label"[^>]*{attr}="([^"]*)"', svg)
    return m.group(1) if m else None


def test_single_block_colony_label_has_no_prefix() -> None:
    """A normal single-block colony (every existing shipped colony, e.g.
    fixtures/shree-vatika-2) has nothing to disambiguate -- its labels stay bare."""
    plot = _plot("P1", "plot-A-01", "A", "01", 10)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony", [])
    assert _label_texts(svg) == ["1"]


def test_two_lettered_blocks_get_prefixed_labels() -> None:
    a = _plot("P1", "plot-A-01", "A", "01", 10)
    b = _plot("P2", "plot-B-01", "B", "01", 30)
    road = derive_road(_SITE, [a.ring, b.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [a, b], [], (), "test-colony", [])
    assert _label_texts(svg) == ["A-1", "B-1"]


def test_blockless_plot_label_is_unchanged() -> None:
    plot = _plot("P1", "plot-07", "", "07", 10)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony", [])
    assert _label_texts(svg) == ["7"]


def test_blockless_and_lettered_plots_with_the_same_number_get_distinct_labels() -> None:
    blockless = _plot("P1", "plot-01", "", "01", 10)
    lettered = _plot("P2", "plot-A-01", "A", "01", 30)
    road = derive_road(_SITE, [blockless.ring, lettered.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [blockless, lettered], [], (), "test-colony", [])
    texts = _label_texts(svg)
    assert texts == ["1", "A-1"]
    assert len(set(texts)) == 2


def test_label_rotation_is_negated_for_svgs_y_down_frame() -> None:
    """docs/plans/17.md, 2026-08-21: DXF is Y-up, apply_transform flips Y, which mirrors
    rotation direction (tier-1.md: "Y is flipped ... needs its own test", not a visual
    glance) -- a 30deg DXF-space label must come out as -30 in SVG-space."""
    plot = _plot("P1", "plot-A-01", "A", "01", 10, rotation_deg=30.0)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony", [])
    assert _label_attr(svg, "data-rotation") == "-30.00"


def test_label_height_is_scaled_by_the_same_transform_as_geometry() -> None:
    """_SITE is 200 units wide; VIEWBOX_WIDTH_PX (1000) / 200 = scale 5.0 -- a 4.0-unit
    DXF-space char_height must come out as 20.00 in the 1000-wide SVG viewBox."""
    plot = _plot("P1", "plot-A-01", "A", "01", 10, height=4.0)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony", [])
    assert _label_attr(svg, "data-label-height") == "20.00"


def test_label_with_no_height_omits_the_attribute() -> None:
    plot = _plot("P1", "plot-A-01", "A", "01", 10, height=None)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony", [])
    assert _label_attr(svg, "data-label-height") is None


# -- feature-label emission (docs/plans/19.md) ------------------------------------------------


def _feature_label_texts(svg: str) -> list[str]:
    return re.findall(r'class="feature-label"[^>]*>([^<]+)<', svg)


def _feature_label_attr(svg: str, attr: str) -> str | None:
    m = re.search(rf'class="feature-label"[^>]*{attr}="([^"]*)"', svg)
    return m.group(1) if m else None


def test_road_annotation_label_matching_no_ring_is_still_rendered() -> None:
    """The road-width-text case: a COL-FEATURE-NO label with no containing ring is not
    dropped -- it is emitted at its own DXF point, unlike classify_features's error for the
    equivalent plot-side case."""
    road_label = Label(
        layer="COL-FEATURE-NO", handle="R1", text="9.0 M W ROAD", point=(5, 5),
        rotation_deg=0.0, height=None,
    )
    road = derive_road(_SITE, [])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [], [], (), "test-colony", [road_label])
    assert _feature_label_texts(svg) == ["9.0 M W ROAD"]


def test_classified_feature_label_is_also_rendered() -> None:
    """A garden/amenity/water label that *did* match a ring now gets its text emitted too
    (previously silently dropped). Builds a real ClassifiedFeature (ring + label), not just
    a bare unmatched label, so this actually exercises the matched-to-a-ring path rather than
    duplicating the road-annotation test above it. Uses a "clubhouse" kind -- not one of
    _HIDDEN_FEATURE_KINDS (park/reserved/other, see the withheld-text test below) -- so this
    test stays about "does a matched feature's text render at all", independent of which
    kinds are currently owner-toggled off."""
    club_ring = Ring(
        layer="COL-AMENITY", handle="A1",
        points=((10, 0), (20, 0), (20, 10), (10, 10)),
    )
    club_label = Label(
        layer="COL-FEATURE-NO", handle="A1L", text="CLUB HOUSE", point=(15, 5),
        rotation_deg=0.0, height=None,
    )
    feature = ClassifiedFeature(
        ring=club_ring, label=club_label, feature_class="amenity", kind="clubhouse"
    )
    road = derive_road(_SITE, [club_ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [], [feature], (), "test-colony", [club_label])
    assert 'class="amenity" data-kind="clubhouse"' in svg
    assert _feature_label_texts(svg) == ["CLUB HOUSE"]


def test_feature_label_rotation_is_negated_for_svgs_y_down_frame() -> None:
    label = Label(
        layer="COL-FEATURE-NO", handle="R1", text="6.0 M W PATHWAY", point=(5, 5),
        rotation_deg=90.0, height=None,
    )
    road = derive_road(_SITE, [])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [], [], (), "test-colony", [label])
    assert _feature_label_attr(svg, "data-rotation") == "-90.00"


def test_feature_labels_are_emitted_in_deterministic_handle_order() -> None:
    later = Label(
        layer="COL-FEATURE-NO", handle="Z9", text="ROAD TO SAILANA", point=(5, 5),
        rotation_deg=0.0, height=None,
    )
    earlier = Label(
        layer="COL-FEATURE-NO", handle="A1", text="9.0 M W ROAD", point=(15, 5),
        rotation_deg=0.0, height=None,
    )
    road = derive_road(_SITE, [])
    t = compute_transform(_SITE)
    # Passed out of handle order -- output must still be sorted by handle.
    svg = build_svg(t, _SITE, road, [], [], (), "test-colony", [later, earlier])
    assert _feature_label_texts(svg) == ["9.0 M W ROAD", "ROAD TO SAILANA"]


def test_feature_label_height_is_scaled_by_the_same_transform_as_geometry() -> None:
    """docs/plans/19.md addendum, 2026-08-24: the owner wants the DWG's own font size, not
    FEATURE_LABEL_SIZE's fixed constant -- mirrors plot-label's own height test exactly."""
    label = Label(
        layer="COL-FEATURE-NO", handle="R1", text="9.0 M W ROAD", point=(5, 5),
        rotation_deg=0.0, height=4.0,
    )
    road = derive_road(_SITE, [])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [], [], (), "test-colony", [label])
    assert _feature_label_attr(svg, "data-label-height") == "20.00"


def test_feature_label_with_no_height_omits_the_attribute() -> None:
    label = Label(
        layer="COL-FEATURE-NO", handle="R1", text="9.0 M W ROAD", point=(5, 5),
        rotation_deg=0.0, height=None,
    )
    road = derive_road(_SITE, [])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [], [], (), "test-colony", [label])
    assert _feature_label_attr(svg, "data-label-height") is None


def _feature(ring_handle: str, layer: str, feature_class: str, kind: str, text: str, x0: float) -> tuple[Ring, Label, ClassifiedFeature]:
    ring = Ring(layer=layer, handle=ring_handle, points=((x0, 0), (x0 + 10, 0), (x0 + 10, 10), (x0, 10)))
    label = Label(
        layer="COL-FEATURE-NO", handle=f"{ring_handle}L", text=text, point=(x0 + 5, 5),
        rotation_deg=0.0, height=None,
    )
    feature = ClassifiedFeature(ring=ring, label=label, feature_class=feature_class, kind=kind)
    return ring, label, feature


def test_park_reserved_and_other_kind_feature_label_text_is_withheld() -> None:
    """Owner, 2026-08-24: first "hide the park", then "hide the reserved and other also" --
    all three withhold text (polygon/data-kind still emit), while an unrelated kind
    (clubhouse) in the same call proves the hidden set isn't swallowing everything."""
    park_ring, park_label, park_feature = _feature("P1", "COL-GARDEN", "garden", "park", "PARK", 10)
    reserved_ring, reserved_label, reserved_feature = _feature(
        "A1", "COL-AMENITY", "amenity", "reserved", "RESERVED", 50
    )
    other_ring, other_label, other_feature = _feature("A2", "COL-AMENITY", "amenity", "other", "OTHER", 90)
    club_ring, club_label, club_feature = _feature(
        "A3", "COL-AMENITY", "amenity", "clubhouse", "CLUB HOUSE", 130
    )
    rings = [park_ring, reserved_ring, other_ring, club_ring]
    labels = [park_label, reserved_label, other_label, club_label]
    features = [park_feature, reserved_feature, other_feature, club_feature]
    road = derive_road(_SITE, rings)
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [], features, (), "test-colony", labels)
    assert 'class="garden" data-kind="park"' in svg  # every polygon still renders
    assert 'class="amenity" data-kind="reserved"' in svg
    assert 'class="amenity" data-kind="other"' in svg
    assert 'class="amenity" data-kind="clubhouse"' in svg
    assert _feature_label_texts(svg) == ["CLUB HOUSE"]  # only the non-hidden kind's text
