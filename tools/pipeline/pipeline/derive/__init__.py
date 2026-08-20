"""Everything the drawing does not state but geometry can compute (M13,
spec/13-pipe-derive-export.md, docs/plans/14.md). No file-format import -- same purity
boundary as pipeline.geom and pipeline.matching.
"""

from __future__ import annotations

import hashlib


class DeriveError(Exception):
    """A derived value could not be computed. Same raise-and-name-the-handle shape as
    GeomError/MatchingError."""


def stable_seed(colony_id: str) -> int:
    """A hash of colony_id that is stable across process invocations -- unlike the builtin
    hash(), which is salted per-process by PYTHONHASHSEED and would silently break the
    run-twice-get-identical-output requirement (D-105)."""
    return int(hashlib.sha256(colony_id.encode()).hexdigest(), 16) % (2**32)
