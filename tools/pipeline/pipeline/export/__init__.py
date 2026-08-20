"""Normalise, emit, and gate a colony export (M13, spec/13-pipe-derive-export.md). No
file-format import -- same purity boundary as pipeline.geom and pipeline.matching.
"""

from __future__ import annotations

from pipeline.matching.classify import ClassifiedFeature


class ExportError(Exception):
    """Export refused: a QA check failed, or an assembled value is invalid. Same
    raise-and-name-the-handle shape as GeomError/MatchingError/DeriveError."""


def feature_svg_id(feature: ClassifiedFeature) -> str:
    """The DXF entity handle, not the label text -- a handle is unique and stable per
    drawing (assigned once in AutoCAD, preserved across saves), so the same DXF re-ingested
    always produces the same feature ids, and two features that happen to share label text
    (e.g. two rings both labelled "Garden") can never collide. docs/plans/14.md Section 1."""
    return f"{feature.feature_class}-{feature.ring.handle.lower()}"
