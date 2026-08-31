#!/usr/bin/env python3
"""Auto-place COL-FEATURE-NO labels for every COL-GARDEN/COL-AMENITY polygon that
doesn't have one yet, using a fixed default per layer (owner decision, 2026-08-20):
unlabeled COL-GARDEN -> "PARK" (matches GARDEN/PARK/OPEN SPACE/GREEN in
docs/cad-layer-standard.md's keyword table), unlabeled COL-AMENITY -> "RESERVED" (the
unlabeled amenities on this colony were reviewed and are reserved/unplanned land, not a
real clubhouse/temple/parking -- see PROGRESS.md's 2026-08-20 Deferred entry). Already-
labeled polygons are left untouched.

Placement uses shapely's representative_point(), not centroid -- centroid can land
outside a concave polygon, and docs/cad-layer-standard.md requires the insertion point
fall inside the polygon it labels.

Text height is scaled per polygon, not fixed -- the smallest COL-GARDEN/COL-AMENITY
polygons on a real colony can be under 5 ft across, and "RESERVED" at a fixed 2 ft height
renders wider than that (found on JAI DEV, 2026-08-20). Estimated string width (chars *
CHAR_WIDTH_RATIO * height) is capped at SAFETY_FRACTION of the polygon's own narrowest
bounding-box dimension, then clamped to [MIN_HEIGHT, MAX_HEIGHT] so it never goes
illegibly small either. Only the insertion point is ever checked for containment
downstream (docs/cad-layer-standard.md) -- this sizing is purely so the draft is legible
to review, not a correctness requirement.

Same scratch-layer contract as the rest of tools/cad-lisp: writes to
CV-FEATURE-LABELS-DRAFT, never to COL-FEATURE-NO directly. Reimport (PASTEORIG), review
placement and text against the plan, then select-all on the scratch layer and move to
COL-FEATURE-NO.

Usage:
    python fill_missing_labels.py path/to/working.dxf
    python fill_missing_labels.py path/to/working.dxf --garden-default PARK --amenity-default RESERVED
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ezdxf
from shapely.geometry import Point, Polygon

DRAFT_LAYER = ("CV-FEATURE-LABELS-DRAFT", 3)  # green, matches close_polygons.py's label layer color
MIN_HEIGHT = 0.5  # ft; floor so a tiny polygon doesn't get an illegible label
MAX_HEIGHT = 2.0  # ft; same as output.py's marker size, legible at plot scale -- ceiling
CHAR_WIDTH_RATIO = 0.6  # rough average glyph width as a fraction of height, Standard-style text
SAFETY_FRACTION = 0.6  # estimated text width may use at most this much of the polygon's
# narrowest bounding-box dimension -- leaves margin so the label doesn't touch the edge
GARDEN_DEFAULT = "PARK"
AMENITY_DEFAULT = "RESERVED"


def _text_height(text: str, poly: Polygon) -> float:
    minx, miny, maxx, maxy = poly.bounds
    narrow = min(maxx - minx, maxy - miny)
    fitted = (narrow * SAFETY_FRACTION) / (len(text) * CHAR_WIDTH_RATIO)
    return max(MIN_HEIGHT, min(MAX_HEIGHT, fitted))


def main() -> int:
    args = _parse_args()
    src = ezdxf.readfile(args.dxf)
    msp = src.modelspace()

    existing_labels = [
        _label_point(e)
        for e in msp
        if e.dxf.layer == "COL-FEATURE-NO" and e.dxftype() in ("TEXT", "MTEXT")
    ]

    targets: list[tuple[str, str]] = []  # (handle, default_text)
    unlabeled: list[tuple[Point, str, float]] = []  # (insertion point, default_text, height)
    for layer, default in (("COL-GARDEN", args.garden_default), ("COL-AMENITY", args.amenity_default)):
        for e in msp:
            if e.dxf.layer != layer or e.dxftype() != "LWPOLYLINE" or not e.closed:
                continue
            poly = Polygon([(p[0], p[1]) for p in e.get_points("xy")])
            if any(poly.contains(pt) for pt in existing_labels):
                continue
            rp = poly.representative_point()
            height = _text_height(default, poly)
            unlabeled.append((rp, default, height))
            targets.append((e.dxf.handle, default))

    if not unlabeled:
        print("fill_missing_labels: every COL-GARDEN/COL-AMENITY polygon already has a label.")
        return 0

    out_path = args.out or args.dxf.with_name(f"{args.dxf.stem}-labels-draft.dxf")
    _write_output(src, unlabeled, out_path)

    print(f"fill_missing_labels: placed {len(unlabeled)} label(s) on {DRAFT_LAYER[0]}:")
    for handle, default in targets:
        print(f"  {handle}: {default!r}")
    print(f"Wrote {out_path} -- review against the plan before moving onto COL-FEATURE-NO.")
    return 0


def _label_point(entity) -> Point:
    point = entity.dxf.insert
    return Point(point[0], point[1])


def _write_output(src, placements: list[tuple[Point, str, float]], out_path: Path) -> None:
    doc = ezdxf.new(dxfversion=src.dxfversion)
    doc.header["$INSUNITS"] = src.header.get("$INSUNITS", doc.header["$INSUNITS"])
    doc.header["$MEASUREMENT"] = src.header.get("$MEASUREMENT", doc.header["$MEASUREMENT"])
    msp = doc.modelspace()
    name, color = DRAFT_LAYER
    if name not in doc.layers:
        doc.layers.add(name, color=color)
    for point, text, height in placements:
        msp.add_mtext(
            text,
            dxfattribs={
                "layer": name,
                "char_height": height,
                "insert": (point.x, point.y),
                "attachment_point": 5,  # middle-center, matches the per-colony procedure's convention
            },
        )
    doc.saveas(out_path)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="the working DXF to scan")
    p.add_argument("--garden-default", default=GARDEN_DEFAULT)
    p.add_argument("--amenity-default", default=AMENITY_DEFAULT)
    p.add_argument("--out", type=Path, default=None, help="default: <dxf>-labels-draft.dxf")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(main())
