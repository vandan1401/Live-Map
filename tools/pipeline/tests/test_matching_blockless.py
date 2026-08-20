"""Blockless plot ids (docs/plans/15.md) -- split out of test_matching.py to keep that file
under CLAUDE.md invariant 7's 250-line cap.
"""

from __future__ import annotations

from test_matching import _config, _label, _square_ring

from pipeline.matching.assign import assign_plot_numbers


def test_bare_number_with_no_default_block_is_blockless() -> None:
    ring = _square_ring("hRING", "COL-PLOT", (0, 0))
    label = _label("hLABEL", "COL-PLOT-NO", "7", (0, 0))

    result = assign_plot_numbers(
        [ring], [label], _config(blocks=(), default_block=None, number_width=2)
    )

    assert result.plots[0].svg_id == "plot-07"
    assert result.plots[0].block == ""
    assert result.default_block_count == 1
    assert result.explicit_block_count == 0


def test_blockless_bare_number_and_explicit_block_coexist_without_collision() -> None:
    # docs/plans/15.md's real-world trigger: bare "1" and explicit "A-1" are two distinct
    # plots on the same drawing, not two labels for one plot.
    ring_bare = _square_ring("hBARE", "COL-PLOT", (0, 0))
    label_bare = _label("lBARE", "COL-PLOT-NO", "1", (0, 0))
    ring_a = _square_ring("hA", "COL-PLOT", (100, 0))
    label_a = _label("lA", "COL-PLOT-NO", "A-1", (100, 0))

    result = assign_plot_numbers(
        [ring_bare, ring_a],
        [label_bare, label_a],
        _config(blocks=("A",), default_block=None, number_width=2),
    )

    svg_ids = {plot.svg_id for plot in result.plots}
    assert svg_ids == {"plot-01", "plot-A-01"}
    assert result.default_block_count == 1
    assert result.explicit_block_count == 1
