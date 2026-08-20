"""Plot identity: label -> ring containment, then block/number resolution (M12,
spec/12-pipe-matching.md, docs/plans/13.md).

The owner never renumbers a drawing by hand -- bare numbers (`7`, `11`, ...) and occasional
explicit block prefixes (`B-7`) are read as-is and mechanically transformed into the
contract's `plot-{BLOCK}-{NN}` shape, or `plot-{NN}` when the colony's bare numbers are
genuinely blockless (`config.default_block is None`, docs/plans/15.md). Judgement (is this
really a plot number) stays a hard error; the transform itself (padding, prefix resolution)
is the only thing this module does.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from pipeline.extract.types import ColonyConfig, Label, Ring
from pipeline.matching import MatchingError, match_labels_to_rings

# docs/cad-layer-standard.md: a stray dimension string ("12.5M", "7A") must never reach
# block/number resolution -- checked before any containment matching.
_LABEL_PATTERN = re.compile(r"^([A-Z]+-)?[0-9]+$")


@dataclass(frozen=True)
class MatchedPlot:
    """One COL-PLOT ring, resolved to its final contract id."""

    ring: Ring
    label: Label
    svg_id: str
    block: str
    number: str


@dataclass(frozen=True)
class PlotMatchResult:
    """`plots`, plus the block-resolution split spec/12 asks to have reported: how many
    labels took the config's default block vs. carried an explicit prefix."""

    plots: tuple[MatchedPlot, ...]
    default_block_count: int
    explicit_block_count: int


def assign_plot_numbers(
    rings: Sequence[Ring], labels: Sequence[Label], config: ColonyConfig
) -> PlotMatchResult:
    for label in labels:
        if not _LABEL_PATTERN.match(label.text):
            raise MatchingError(
                f"{label.layer} label {label.handle} ('{label.text}') is not a plot number"
            )

    pairs = match_labels_to_rings("plot", rings, labels)

    plots: list[MatchedPlot] = []
    default_block_count = 0
    explicit_block_count = 0
    seen: dict[str, Ring] = {}

    for ring, label in pairs:
        if "-" in label.text:
            block, number_text = label.text.split("-", 1)
            if block not in config.blocks:
                raise MatchingError(
                    f"{label.layer} label {label.handle} ('{label.text}') uses block "
                    f"{block}, not in blocks {list(config.blocks)}"
                )
            explicit_block_count += 1
        else:
            block = config.default_block or ""
            number_text = label.text
            default_block_count += 1

        number = int(number_text)
        low, high = config.number_range
        if not (low <= number <= high):
            raise MatchingError(
                f"{label.layer} label {label.handle}: number {number} outside "
                f"number_range {list(config.number_range)}"
            )
        if len(str(number)) > config.number_width:
            raise MatchingError(
                f"{label.layer} label {label.handle}: number {number} exceeds "
                f"number_width {config.number_width}"
            )

        padded = str(number).zfill(config.number_width)
        svg_id = f"plot-{block}-{padded}" if block else f"plot-{padded}"
        if svg_id in seen:
            raise MatchingError(
                f"{ring.layer} {ring.handle} and {ring.layer} {seen[svg_id].handle} "
                f"both resolve to {svg_id}"
            )
        seen[svg_id] = ring

        plots.append(
            MatchedPlot(ring=ring, label=label, svg_id=svg_id, block=block, number=padded)
        )

    return PlotMatchResult(
        plots=tuple(plots),
        default_block_count=default_block_count,
        explicit_block_count=explicit_block_count,
    )
