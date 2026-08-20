"""Writes close_polygons.py's result DXF: the traced polygons, gap/fusion/missing
markers, and (optionally) copies of the source and unclosed-line geometry needed to
review or keep iterating on the result without going back to the original drawing.
"""

from __future__ import annotations

import re
from pathlib import Path

import ezdxf
import ezdxf.bbox
from ezdxf.document import Drawing
from shapely.geometry import Polygon

from labels import Label

INLINE_COLOR_CODE = re.compile(r"\\C\d+;")  # MTEXT formatting embedded in the text
# content itself (e.g. "\C7;"), not the entity's own color -- overrides BYLAYER for that
# text run regardless of what layer/color the entity is on, so it has to be stripped too
FLAG_RADIUS = 0.5  # matches the CIRCLE radius cv:bridge-gaps flags with in cv-tools.lsp
MULTI_LABEL_DISPLAY_CAP = 8  # longest label list to print in full on a CV-MULTI marker
TEXT_HEIGHT = 2.0  # ft; MTEXT marker size for CV-MULTI/CV-MISSING, legible at plot scale
SOURCE_BLOCK_NAME = "CV-MERGED-SOURCE"

PLOT_DRAFT_LAYER = ("CV-PLOT-DRAFT", 1)  # red -- traced against the original CV-MERGED
# lines, any line NOT overlaid in red is geometry that didn't end up in a closed polygon
FLAGS_LAYER = ("CV-FLAGS", 4)
MULTI_LAYER = ("CV-MULTI", 2)
MISSING_LAYER = ("CV-MISSING", 6)
UNCLOSED_LAYER = ("CV-UNCLOSED", 7)  # white/black -- original lines with an unresolved
# endpoint, copied loose next to the traced side so EXTEND has something to grab
LABELS_LAYER = ("CV-PLOT-LABELS", 3)  # green -- just the matched plot-number labels, so
# a rerun of this script directly on its own output still has something to cross-check


def write_output(
    src: Drawing,
    all_entities: list,
    source_entities: list,
    unclosed_entities: list,
    label_entities: list,
    polygons: list[Polygon],
    flags: list,
    fused: dict[int, list[str]],
    missing: list[Label],
    out_path: Path,
    offset_ratio: float,
    overlay: bool,
    source_as_block: bool,
) -> None:
    doc = ezdxf.new(dxfversion=src.dxfversion)
    msp = doc.modelspace()
    layer_defs = (PLOT_DRAFT_LAYER, FLAGS_LAYER, MULTI_LAYER, MISSING_LAYER, UNCLOSED_LAYER, LABELS_LAYER)
    for name, color in layer_defs:
        if name not in doc.layers:
            doc.layers.add(name, color=color)

    dx = 0.0
    if not overlay:
        box = ezdxf.bbox.extents(all_entities)
        width = box.extmax.x - box.extmin.x
        dx = width + width * offset_ratio

    if source_entities:
        skipped = 0
        target = doc.blocks.new(name=SOURCE_BLOCK_NAME) if source_as_block else msp
        for entity in source_entities:
            try:
                copy = entity.copy()
                copy.dxf.invisible = 0  # CV-HIDETEXT in AutoCAD sets this on the
                # source drawing's text; a copy should never inherit "hidden"
                target.add_foreign_entity(copy)
            except Exception:
                skipped += 1
        if skipped:
            print(f"close_polygons: skipped {skipped} source entity(ies) that don't copy standalone")
        if source_as_block:
            msp.add_blockref(SOURCE_BLOCK_NAME, insert=(0, 0, 0))

    for entity in unclosed_entities:
        copy = entity.copy()
        copy.dxf.layer = UNCLOSED_LAYER[0]
        copy.dxf.color = 256  # BYLAYER -- source entities often carry their own explicit
        # color override, which would hide the layer's own color otherwise
        copy.dxf.invisible = 0
        copy.translate(dx, 0, 0)
        msp.add_foreign_entity(copy)

    for entity in label_entities:
        copy = entity.copy()
        copy.dxf.layer = LABELS_LAYER[0]
        copy.dxf.invisible = 0  # CV-HIDETEXT in AutoCAD sets this on the source
        # drawing's text -- without clearing it these copies are invisible AND
        # unselectable, not just hard to see
        copy.dxf.color = 256  # BYLAYER -- same reason: force the layer's green to show
        if copy.dxftype() == "MTEXT":
            copy.text = INLINE_COLOR_CODE.sub("", copy.text)
        copy.translate(dx, 0, 0)
        msp.add_foreign_entity(copy)

    for polygon in polygons:
        pts = [(x + dx, y) for x, y in polygon.exterior.coords]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": PLOT_DRAFT_LAYER[0]})
    for (x, y), _entity_idx in flags:
        msp.add_circle((x + dx, y), FLAG_RADIUS, dxfattribs={"layer": FLAGS_LAYER[0]})
    for i, names in fused.items():
        centroid = polygons[i].centroid
        shown = ", ".join(names[:MULTI_LABEL_DISPLAY_CAP])
        if len(names) > MULTI_LABEL_DISPLAY_CAP:
            shown += f", +{len(names) - MULTI_LABEL_DISPLAY_CAP} more"
        msp.add_mtext(
            f"{len(names)} plots fused: {shown}",
            dxfattribs={
                "layer": MULTI_LAYER[0],
                "char_height": TEXT_HEIGHT,
                "insert": (centroid.x + dx, centroid.y),
            },
        )
    for text, (x, y), _entity in missing:
        msp.add_mtext(
            f"plot {text}: no closed region found",
            dxfattribs={"layer": MISSING_LAYER[0], "char_height": TEXT_HEIGHT, "insert": (x + dx, y)},
        )
        msp.add_circle((x + dx, y), FLAG_RADIUS, dxfattribs={"layer": MISSING_LAYER[0]})
    doc.saveas(out_path)
