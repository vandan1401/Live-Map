"""Read a conforming DXF into the neutral intermediate structure (D-118, M10).

`ezdxf` is the only format-specific dependency in this module and it never crosses into
`pipeline.extract.types` — see that module's docstring. The reader is strict: every
rejection names the layer and the entity handle, and nothing is repaired, guessed, or
defaulted (`docs/cad-layer-standard.md`).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import ezdxf
from ezdxf.entities import DXFGraphic

from pipeline.extract.types import ColonyConfig, DxfIngestResult, Label, Ring

# Layer standard, docs/cad-layer-standard.md.
_RING_LAYERS = ("COL-SITE", "COL-PLOT", "COL-GARDEN", "COL-AMENITY", "COL-WATER")
_LABEL_LAYERS = ("COL-PLOT-NO", "COL-FEATURE-NO")
_NORTH_LAYER = "COL-NORTH"
_NORTH_DISAGREEMENT_DEG = 1.0  # docs/cad-layer-standard.md: two north sources must agree within this


class DxfConformanceError(Exception):
    """A DXF entity, or the colony config, does not conform to docs/cad-layer-standard.md."""


def load_colony_config(colony_id: str, colonies_dir: Path) -> ColonyConfig:
    path = colonies_dir / f"{colony_id}.json"
    if not path.exists():
        raise DxfConformanceError(f"no colony config at {path}")
    data: dict[str, Any] = json.loads(path.read_text())
    try:
        blocks = tuple(data["blocks"])
        default_block = data.get("default_block", blocks[0] if blocks else None)
        if default_block is not None and default_block not in blocks:
            raise DxfConformanceError(
                f"{path}: default_block {default_block!r} is not in blocks {list(blocks)}"
            )
        return ColonyConfig(
            id=data["id"],
            name=data["name"],
            units=data["units"],
            expected_plots=data["expected_plots"],
            blocks=blocks,
            default_block=default_block,
            number_width=data["number_width"],
            number_range=tuple(data["number_range"]),
            north_deg=data.get("north_deg"),
            source=data["source"],
        )
    except KeyError as exc:
        raise DxfConformanceError(f"{path} is missing required field {exc}") from exc


def ingest_dxf(dxf_path: Path, config: ColonyConfig) -> DxfIngestResult:
    try:
        doc = ezdxf.readfile(dxf_path)
    except OSError as exc:
        raise DxfConformanceError(f"could not read {dxf_path}: {exc}") from exc
    except ezdxf.DXFError as exc:
        raise DxfConformanceError(f"{dxf_path} is not a valid DXF: {exc}") from exc

    rings: list[Ring] = []
    labels: list[Label] = []
    site_count = 0
    north_lines: list[DXFGraphic] = []

    for entity in doc.modelspace():
        layer = entity.dxf.layer
        if layer in _RING_LAYERS:
            ring = _read_ring(entity, layer)
            rings.append(ring)
            if layer == "COL-SITE":
                site_count += 1
        elif layer in _LABEL_LAYERS:
            labels.append(_read_label(entity, layer))
        elif layer == _NORTH_LAYER:
            if entity.dxftype() != "LINE":
                raise DxfConformanceError(
                    f"{_NORTH_LAYER} entity {entity.dxf.handle} is a {entity.dxftype()}, "
                    "not a LINE"
                )
            north_lines.append(entity)
        # else: not a standard layer (title block, dimensions, ...) - ignored silently.

    if site_count != 1:
        raise DxfConformanceError(f"COL-SITE has {site_count} entities, expected exactly 1")
    if len(north_lines) > 1:
        raise DxfConformanceError(f"COL-NORTH has {len(north_lines)} entities, expected 0 or 1")

    north_deg = _resolve_north_deg(north_lines[0] if north_lines else None, config)

    return DxfIngestResult(
        rings=tuple(rings), labels=tuple(labels), north_deg=north_deg, config=config
    )


def _read_ring(entity: DXFGraphic, layer: str) -> Ring:
    if entity.dxftype() != "LWPOLYLINE":
        raise DxfConformanceError(
            f"{layer} entity {entity.dxf.handle} is a {entity.dxftype()}, "
            "not a closed LWPOLYLINE"
        )
    if not entity.closed:  # type: ignore[attr-defined]
        raise DxfConformanceError(f"{layer} entity {entity.dxf.handle} is not closed")
    points = tuple(
        (float(p[0]), float(p[1])) for p in entity.get_points("xy")  # type: ignore[attr-defined]
    )
    return Ring(layer=layer, handle=entity.dxf.handle, points=points)


def _read_label(entity: DXFGraphic, layer: str) -> Label:
    dxftype = entity.dxftype()
    if dxftype not in ("TEXT", "MTEXT"):
        raise DxfConformanceError(
            f"{layer} entity {entity.dxf.handle} is a {dxftype}, not TEXT or MTEXT"
        )
    text = entity.plain_text() if dxftype == "MTEXT" else entity.dxf.text  # type: ignore[attr-defined]
    point = entity.dxf.insert
    return Label(
        layer=layer,
        handle=entity.dxf.handle,
        text=text.strip(),
        point=(float(point[0]), float(point[1])),
    )


def _resolve_north_deg(north_line: DXFGraphic | None, config: ColonyConfig) -> float:
    from_line = None
    if north_line is not None:
        start, end = north_line.dxf.start, north_line.dxf.end
        dx, dy = end[0] - start[0], end[1] - start[1]
        from_line = math.degrees(math.atan2(dx, dy)) % 360

    if from_line is None and config.north_deg is None:
        raise DxfConformanceError(
            "no COL-NORTH line and no north_deg in the colony config - one is required"
        )
    if from_line is None:
        assert config.north_deg is not None
        return config.north_deg
    if config.north_deg is None:
        return from_line

    diff = abs(from_line - config.north_deg) % 360
    diff = min(diff, 360 - diff)
    if diff > _NORTH_DISAGREEMENT_DEG:
        raise DxfConformanceError(
            f"COL-NORTH reads {from_line:.1f} deg but the colony config says "
            f"{config.north_deg:.1f} deg - these disagree by more than "
            f"{_NORTH_DISAGREEMENT_DEG} deg"
        )
    return from_line
