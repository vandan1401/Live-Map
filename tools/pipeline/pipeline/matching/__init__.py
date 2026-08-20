"""Identity and classification (M12, spec/12-pipe-matching.md, docs/plans/13.md).

D-118 deleted the old three-rung matching ladder (contained -> nearest-within-threshold ->
flag). What remains is one containment test: a label belongs to the ring that contains its
insertion point. Every other outcome -- a plot with no label, two labels, a label inside no
plot, two plots claiming the same number -- is a hard error naming the entity handle, never
a flag or a best guess (tier-1.md, "Matching is identity").

No file-format import here or in `assign.py`/`classify.py` -- same purity boundary as
`pipeline.geom` (tier-1.md/tier-2.md, "format code stays at the edge").
"""

from __future__ import annotations

from collections.abc import Sequence

from pipeline.extract.types import Label, Ring
from pipeline.geom import contains


class MatchingError(Exception):
    """A label/ring pairing is ambiguous or missing, or a label/config value is invalid.
    Same shape as pipeline.extract.dxf.DxfConformanceError and pipeline.geom.GeomError:
    every rejection names the entity handle(s) involved."""


def match_labels_to_rings(
    noun: str, rings: Sequence[Ring], labels: Sequence[Label]
) -> tuple[tuple[Ring, Label], ...]:
    """Pairs each ring with the single label whose insertion point it contains.

    Shared by assign.py (plots) and classify.py (features) -- the one containment test
    spec/12 replaced the old ladder with. `noun` names the entity kind in error messages
    ("plot", "feature"). Raises MatchingError, naming the entity handle(s), for: a ring
    with zero or 2+ matching labels; a label matching zero or 2+ rings.
    """
    ring_labels: dict[str, list[Label]] = {ring.handle: [] for ring in rings}
    label_rings: dict[str, list[Ring]] = {label.handle: [] for label in labels}
    for ring in rings:
        for label in labels:
            if contains(ring, label.point):
                ring_labels[ring.handle].append(label)
                label_rings[label.handle].append(ring)

    for label in labels:
        matches = label_rings[label.handle]
        if len(matches) == 0:
            raise MatchingError(
                f"{label.layer} label {label.handle} ('{label.text}') is inside no {noun}"
            )
        if len(matches) > 1:
            handles = ", ".join(ring.handle for ring in matches)
            raise MatchingError(
                f"{label.layer} label {label.handle} ('{label.text}') is inside multiple "
                f"{noun}s: {handles}"
            )

    pairs: list[tuple[Ring, Label]] = []
    for ring in rings:
        ring_matches = ring_labels[ring.handle]
        if len(ring_matches) == 0:
            raise MatchingError(f"{ring.layer} {noun} {ring.handle} has no label")
        if len(ring_matches) > 1:
            handles = ", ".join(label.handle for label in ring_matches)
            raise MatchingError(f"{ring.layer} {noun} {ring.handle} has 2 labels: {handles}")
        pairs.append((ring, ring_matches[0]))
    return tuple(pairs)
