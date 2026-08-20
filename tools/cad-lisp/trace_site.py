#!/usr/bin/env python3
"""Trace an already-drawn but not-yet-closed COL-SITE boundary out of CV-MERGED, the
same way close_polygons.py traces plots: flatten entities, bridge small gaps, polygonize.
Built after derive_site.py's union/hull approach turned out wrong for a colony that
already has a real boundary drawn (as color 1/red segments mixed into CV-MERGED alongside
plot geometry) -- deriving from the feature union only approximates the true property
line and, worse, a convex hull across disconnected clusters cuts far outside it, which
would misclassify real off-site land as road (site - union(features)). Use this instead
whenever the plan has a hand-drawn boundary to recover; fall back to derive_site.py only
when nothing was drawn at all.

Filters CV-MERGED (or --layer) entities by --color (default 1/red) so the boundary traces
separately from the plot geometry sharing the same layer. If tracing yields more than one
closed region (an artifact loop, a sliver), only the largest by area is kept and the rest
are reported, not silently dropped.

Same scratch-layer contract as the rest of tools/cad-lisp: writes to CV-SITE-DRAFT, never
to COL-SITE directly -- review against the plan, especially any bridged gap, before
promoting (docs/cad-layer-standard.md, D-118).

Usage:
    python trace_site.py path/to/export.dxf
    python trace_site.py path/to/export.dxf --color 1 --gap-tolerance 1.0
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ezdxf

from polygonize import bridge_gaps, collect_loose_endpoints, flatten_entities, trace_polygons

SOURCE_LAYER_DEFAULT = "CV-MERGED"
SOURCE_COLOR_DEFAULT = 1  # AutoCAD color index 1 = red
SOURCE_TYPES = {"LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE"}
GAP_TOLERANCE_DEFAULT = 0.5
CURVE_TOLERANCE_DEFAULT = 0.05
SITE_DRAFT_LAYER = ("CV-SITE-DRAFT", 5)  # same name/color as derive_site.py's output


def main() -> int:
    args = _parse_args()
    src = ezdxf.readfile(args.dxf)
    entities = [
        e for e in src.modelspace()
        if e.dxf.layer == args.layer and e.dxf.color == args.color and e.dxftype() in SOURCE_TYPES
    ]
    if not entities:
        print(f"trace_site: no {sorted(SOURCE_TYPES)} entities on layer '{args.layer}' color {args.color}.")
        return 1

    paths = flatten_entities(entities, args.curve_tolerance)
    loose = collect_loose_endpoints(paths)
    bridges, flags = bridge_gaps(loose, paths, args.gap_tolerance)
    polygons = trace_polygons(paths, bridges)

    if not polygons:
        print(f"trace_site: {len(entities)} entities, {len(bridges)} gap(s) bridged, "
              f"{len(flags)} flagged, but no closed region traced -- boundary is still open somewhere.")
        return 1

    polygons.sort(key=lambda p: -p.area)
    site = polygons[0]
    discarded = polygons[1:]

    out_path = args.out or args.dxf.with_name(f"{args.dxf.stem}-site-draft.dxf")
    _write_output(src, site, out_path)

    print(
        f"trace_site: {len(entities)} entities from {args.layer} color {args.color}, "
        f"{len(bridges)} gap(s) bridged, {len(flags)} endpoint(s) flagged. "
        f"Traced {len(polygons)} closed region(s), kept the largest (area {site.area:.0f})."
    )
    if discarded:
        print(f"  {len(discarded)} smaller region(s) discarded, areas: "
              f"{[round(p.area, 1) for p in discarded]} -- review if any of these look real.")
    if flags:
        print(f"  {len(flags)} endpoint(s) could not be bridged within {args.gap_tolerance} -- "
              "boundary may be genuinely open there; check the plan.")
    print(f"Wrote {out_path} on {SITE_DRAFT_LAYER[0]} -- review against the plan before promoting to COL-SITE.")
    return 0


def _write_output(src, site, out_path: Path) -> None:
    doc = ezdxf.new(dxfversion=src.dxfversion)
    msp = doc.modelspace()
    name, color = SITE_DRAFT_LAYER
    if name not in doc.layers:
        doc.layers.add(name, color=color)
    msp.add_lwpolyline(list(site.exterior.coords), close=True, dxfattribs={"layer": name})
    doc.saveas(out_path)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="DXF exported from AutoCAD (DXFOUT)")
    p.add_argument("--layer", default=SOURCE_LAYER_DEFAULT, help=f"default: {SOURCE_LAYER_DEFAULT}")
    p.add_argument("--color", type=int, default=SOURCE_COLOR_DEFAULT, help=f"AutoCAD color index, default: {SOURCE_COLOR_DEFAULT} (red)")
    p.add_argument("--gap-tolerance", type=float, default=GAP_TOLERANCE_DEFAULT)
    p.add_argument("--curve-tolerance", type=float, default=CURVE_TOLERANCE_DEFAULT)
    p.add_argument("--out", type=Path, default=None, help="default: <dxf>-site-draft.dxf")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(main())
