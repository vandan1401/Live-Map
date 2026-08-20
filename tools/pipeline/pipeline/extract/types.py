"""The neutral intermediate structure every extraction module reads and writes.

No format-specific type (`ezdxf`, PyMuPDF, ...) may appear here or anywhere past this
module — that boundary is what let D-118 swap the entire front end from PDF to DXF without
touching anything downstream (tier-2.md, "format code stays at the edge").
"""

from __future__ import annotations

from dataclasses import dataclass

Point = tuple[float, float]


@dataclass(frozen=True)
class Ring:
    """A closed polygon lifted straight from the source, in drawing coordinates.

    `layer` is the source layer (`COL-PLOT`, `COL-GARDEN`, ...) — M12 reads it to classify.
    `handle` names the source entity so a conformance error can point the owner at exactly
    what to `SELECT` in AutoCAD.
    """

    layer: str
    handle: str
    points: tuple[Point, ...]


@dataclass(frozen=True)
class Label:
    """A text label and its insertion point, in drawing coordinates."""

    layer: str
    handle: str
    text: str
    point: Point


@dataclass(frozen=True)
class ColonyConfig:
    """One colony's `tools/pipeline/colonies/<id>.json`, loaded and typed."""

    id: str
    name: str
    units: str
    expected_plots: int
    blocks: tuple[str, ...]
    default_block: str | None  # block a bare (unprefixed) plot number resolves to; None = no block
    number_width: int
    number_range: tuple[int, int]
    north_deg: float | None
    source: dict[str, str]


@dataclass(frozen=True)
class DxfIngestResult:
    """Everything M10 read out of a conforming DXF, ready for M11/M12."""

    rings: tuple[Ring, ...]
    labels: tuple[Label, ...]
    north_deg: float
    config: ColonyConfig
