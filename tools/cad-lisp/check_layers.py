#!/usr/bin/env python3
"""Preflight check mirroring pipeline/extract/dxf.py's DXF-conformance checks
(docs/cad-layer-standard.md), run directly against a working AutoCAD DXF -- catch the
same rejection categories `make ingest` would raise, before ever exporting for real:
wrong entity type or unclosed ring on a COL-* layer, COL-SITE not exactly 1 entity, a
plot/feature polygon with zero or 2+ labels inside it, a label inside no polygon at all.

Also reports CV-PLOT-DRAFT: how many entities are still sitting there un-promoted, and
flags any COL-PLOT-NO label that lands inside a CV-PLOT-DRAFT polygon instead of a
COL-PLOT one -- usually a real, already-numbered plot whose outline never got promoted,
not a missing plot.

Standalone: no colony config, no dependency on contract/ or tools/pipeline. Deliberately
does NOT check north agreement (needs the colony config's north_deg) or feature-label
keyword classification (pipeline.matching.classify, M12, built 2026-08-20) -- COL-FEATURE-NO
labels are only checked for one-per-polygon here, not matched against RESERVED/OTHER/GARDEN/etc.

Usage:
    python check_layers.py path/to/working.dxf
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ezdxf
from shapely.geometry import Point, Polygon

RING_LAYERS = ("COL-SITE", "COL-PLOT", "COL-GARDEN", "COL-AMENITY", "COL-WATER")
LABEL_LAYERS = ("COL-PLOT-NO", "COL-FEATURE-NO")
DRAFT_LAYER = "CV-PLOT-DRAFT"

Ring = tuple[str, Polygon]  # handle, polygon
Label = tuple[str, tuple[float, float]]  # text, point


def main() -> int:
    args = _parse_args()
    doc = ezdxf.readfile(args.dxf)
    msp = doc.modelspace()

    errors: list[str] = []
    rings: dict[str, list[Ring]] = {name: [] for name in RING_LAYERS}
    for e in msp:
        layer = e.dxf.layer
        if layer not in RING_LAYERS:
            continue
        if e.dxftype() != "LWPOLYLINE":
            errors.append(f"{layer} entity {e.dxf.handle} is a {e.dxftype()}, not LWPOLYLINE")
            continue
        if not e.closed:
            errors.append(f"{layer} entity {e.dxf.handle} is not closed")
            continue
        pts = [(p[0], p[1]) for p in e.get_points("xy")]
        rings[layer].append((e.dxf.handle, Polygon(pts)))

    site_count = len(rings["COL-SITE"])
    if site_count != 1:
        errors.append(f"COL-SITE has {site_count} entities, expected exactly 1")

    labels: dict[str, list[Label]] = {name: [] for name in LABEL_LAYERS}
    for e in msp:
        layer = e.dxf.layer
        if layer not in LABEL_LAYERS:
            continue
        if e.dxftype() not in ("TEXT", "MTEXT"):
            errors.append(f"{layer} entity {e.dxf.handle} is a {e.dxftype()}, not TEXT/MTEXT")
            continue
        text = e.plain_text().strip() if e.dxftype() == "MTEXT" else e.dxf.text.strip()
        point = e.dxf.insert
        labels[layer].append((text, (point[0], point[1])))

    plot_msgs, plot_orphans = _check_containment(rings["COL-PLOT"], labels["COL-PLOT-NO"], "plot")
    feature_rings = rings["COL-GARDEN"] + rings["COL-AMENITY"] + rings["COL-WATER"]
    feature_msgs, _ = _check_containment(feature_rings, labels["COL-FEATURE-NO"], "feature")

    draft_rings = [
        (e.dxf.handle, Polygon([(p[0], p[1]) for p in e.get_points("xy")]))
        for e in msp
        if e.dxf.layer == DRAFT_LAYER and e.dxftype() == "LWPOLYLINE" and e.closed
    ]
    draft_count = sum(1 for e in msp if e.dxf.layer == DRAFT_LAYER)
    stranded = _stranded_labels(draft_rings, plot_orphans)

    _report("DXF conformance (mirrors pipeline/extract/dxf.py)", errors)
    _report("COL-PLOT / COL-PLOT-NO containment", plot_msgs)
    _report("COL-GARDEN+AMENITY+WATER / COL-FEATURE-NO containment", feature_msgs)

    print(f"\n{DRAFT_LAYER}: {draft_count} entity(ies) not yet promoted")
    if stranded:
        print(f"  {len(stranded)} numbered label(s) sitting on a draft polygon, not COL-PLOT:")
        for text, (x, y) in stranded:
            print(f"    plot {text!r} at ({x:.1f}, {y:.1f})")

    total = len(errors) + len(plot_msgs) + len(feature_msgs)
    print(f"\n{total} conformance issue(s), {len(stranded)} stranded label(s).")
    return 1 if total else 0


def _check_containment(rings: list[Ring], labels: list[Label], kind: str) -> tuple[list[str], list[Label]]:
    msgs: list[str] = []
    counts: dict[str, list[str]] = {handle: [] for handle, _ in rings}
    orphans: list[Label] = []
    for text, (x, y) in labels:
        pt = Point(x, y)
        hit = next((handle for handle, poly in rings if poly.contains(pt)), None)
        if hit is None:
            orphans.append((text, (x, y)))
        else:
            counts[hit].append(text)
    for handle, names in counts.items():
        if not names:
            msgs.append(f"{kind} {handle} has no label")
        elif len(names) > 1:
            msgs.append(f"{kind} {handle} has {len(names)} labels: {names}")
    for text, (x, y) in orphans:
        msgs.append(f"label {text!r} at ({x:.1f}, {y:.1f}) is inside no {kind}")
    return msgs, orphans


def _stranded_labels(draft_rings: list[Ring], plot_orphans: list[Label]) -> list[Label]:
    return [
        (text, pt) for text, pt in plot_orphans
        if any(poly.contains(Point(pt)) for _, poly in draft_rings)
    ]


def _report(title: str, msgs: list[str]) -> None:
    print(f"\n--- {title}: {len(msgs)} issue(s) ---")
    for m in msgs:
        print(f"  {m}")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="the working DXF to check")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(main())
