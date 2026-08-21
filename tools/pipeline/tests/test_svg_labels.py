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

_SITE = Ring(layer="COL-SITE", handle="S1", points=((0, 0), (200, 0), (200, 100), (0, 100)))


def _plot(handle: str, svg_id: str, block: str, number: str, x0: float) -> MatchedPlot:
    ring = Ring(
        layer="COL-PLOT",
        handle=handle,
        points=((x0, 0), (x0 + 10, 0), (x0 + 10, 10), (x0, 10)),
    )
    label = Label(layer="COL-PLOT-NO", handle=f"{handle}L", text=number, point=(x0 + 5, 5))
    return MatchedPlot(ring=ring, label=label, svg_id=svg_id, block=block, number=number)


def _label_texts(svg: str) -> list[str]:
    return re.findall(r'class="plot-label"[^>]*>([^<]+)<', svg)


def test_single_block_colony_label_has_no_prefix() -> None:
    """A normal single-block colony (every existing shipped colony, e.g.
    fixtures/shree-vatika-2) has nothing to disambiguate -- its labels stay bare."""
    plot = _plot("P1", "plot-A-01", "A", "01", 10)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony")
    assert _label_texts(svg) == ["1"]


def test_two_lettered_blocks_get_prefixed_labels() -> None:
    a = _plot("P1", "plot-A-01", "A", "01", 10)
    b = _plot("P2", "plot-B-01", "B", "01", 30)
    road = derive_road(_SITE, [a.ring, b.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [a, b], [], (), "test-colony")
    assert _label_texts(svg) == ["A-1", "B-1"]


def test_blockless_plot_label_is_unchanged() -> None:
    plot = _plot("P1", "plot-07", "", "07", 10)
    road = derive_road(_SITE, [plot.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [plot], [], (), "test-colony")
    assert _label_texts(svg) == ["7"]


def test_blockless_and_lettered_plots_with_the_same_number_get_distinct_labels() -> None:
    blockless = _plot("P1", "plot-01", "", "01", 10)
    lettered = _plot("P2", "plot-A-01", "A", "01", 30)
    road = derive_road(_SITE, [blockless.ring, lettered.ring])
    t = compute_transform(_SITE)
    svg = build_svg(t, _SITE, road, [blockless, lettered], [], (), "test-colony")
    texts = _label_texts(svg)
    assert texts == ["1", "A-1"]
    assert len(set(texts)) == 2
