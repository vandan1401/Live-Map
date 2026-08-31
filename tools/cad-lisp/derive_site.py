#!/usr/bin/env python3
"""Derive a draft COL-SITE boundary from the union of every other COL-* ring already on
the drawing, plus CV-PLOT-DRAFT (close_polygons.py's traced-but-not-yet-promoted plots),
by default (COL-PLOT, COL-GARDEN, COL-AMENITY, COL-WATER, CV-PLOT-DRAFT). Including
CV-PLOT-DRAFT matters if any plots are still sitting there rather than promoted to
COL-PLOT -- otherwise the derived boundary would clip land that is a real plot, just not
yet reviewed and moved. For a colony whose plan has no separately-drawn property boundary
to trace, this gives you a starting shape instead of tracing one by hand -- same "scratch
layer, review before promoting" contract as the rest of tools/cad-lisp: writes to
CV-SITE-DRAFT, never to COL-SITE directly, because whether the real boundary needs a
margin beyond the outermost feature (a wall, an entrance strip, a setback) is a judgement
call against the plan, not something this script can know (docs/cad-layer-standard.md,
D-118: judgement stays with you).

The final result is offset outward by only --margin (default 0.5 ft) -- cheap insurance
against a boundary that hugs feature edges exactly ending up a hair *inside* one of them
after DXF export/reimport rounding (the pipeline's road computation is
`site - union(plots, garden, amenity, water)`, tier-2.md, and a site that does not fully
contain every feature produces an invalid or clipped result there). It does NOT need to
match the true property line.

If a plot cluster is disconnected from the rest (a gap where a road was never drawn,
D-104), a plain union leaves it as a separate piece. Rather than resorting to a convex
hull -- which "joins all the outermost points" and cuts straight across every concave
edge and gap, overshooting badly (found on JAI DEV, 2026-08-20: it swallowed a large
chunk of open land as if it were part of the site) -- this dilates by --gap-bridge
(default 8 ft) to merge disconnected pieces, then erodes back down so the *net* offset
everywhere is still just --margin, not the full bridging distance. Only if --gap-bridge
still isn't enough to merge everything does it fall back to a convex hull on the
un-bridged union, printed clearly so you know the result needs real review rather than a
quick promote.

No dependency on cv-tools.lsp, contract/, or tools/pipeline.

Usage:
    python derive_site.py path/to/export.dxf
    python derive_site.py path/to/export.dxf --margin 10 --layers COL-PLOT,COL-GARDEN

Workflow: once COL-PLOT/COL-GARDEN/COL-AMENITY/COL-WATER are all finalised on the real
drawing, DXFOUT, run this script on the export, then reimport the result (open the output
DXF, select all, Ctrl+C, switch to the original drawing, PASTEORIG) -- review CV-SITE-DRAFT
against the plan before tracing or moving anything onto COL-SITE.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import ezdxf
from shapely.geometry import Polygon
from shapely.ops import unary_union

from polygonize import MIN_POLYGON_AREA, entity_to_points

RING_TYPES = {"LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE"}
LAYERS_DEFAULT = ("COL-PLOT", "COL-GARDEN", "COL-AMENITY", "COL-WATER", "CV-PLOT-DRAFT")
MARGIN_FT_DEFAULT = 0.5  # final net safety margin -- NOT the gap-bridging distance
GAP_BRIDGE_FT_DEFAULT = 8.0  # transient dilation to merge a disconnected cluster; eroded
# back down to --margin afterward, so this does not inflate the final boundary
CURVE_TOLERANCE_DEFAULT = 0.05  # ft; same meaning as close_polygons.py's --curve-tolerance
FT_PER_M = 0.3048
SITE_DRAFT_LAYER = ("CV-SITE-DRAFT", 5)  # blue -- distinct from close_polygons.py's layers


def main() -> int:
    args = _parse_args()
    src = ezdxf.readfile(args.dxf)
    layers = set(args.layers.split(","))
    margin = args.margin_ft * (FT_PER_M if args.units == "m" else 1.0)

    entities = [
        e for e in src.modelspace() if e.dxf.layer in layers and e.dxftype() in RING_TYPES
    ]
    if not entities:
        print(f"derive_site: no {sorted(RING_TYPES)} entities on layers {sorted(layers)}.")
        return 1

    polygons: list[Polygon] = []
    skipped = 0
    for entity in entities:
        pts = entity_to_points(entity, args.curve_tolerance)
        if len(pts) < 3:
            skipped += 1
            continue
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)  # fixes the common self-touch/bowtie case
        if poly.area > MIN_POLYGON_AREA:
            polygons.append(poly)
        else:
            skipped += 1

    if not polygons:
        print(f"derive_site: found {len(entities)} entity(ies) but none traced to a usable polygon.")
        return 1

    gap_bridge = args.gap_bridge_ft * (FT_PER_M if args.units == "m" else 1.0)
    union = unary_union(polygons)
    if union.geom_type != "MultiPolygon":
        hull_used = False
        site = union.buffer(margin)
    else:
        bridged = union.buffer(gap_bridge)
        if bridged.geom_type == "MultiPolygon":
            hull_used = True  # --gap-bridge wasn't enough to merge every cluster
            site = union.convex_hull
        else:
            hull_used = False
            site = bridged.buffer(margin - gap_bridge)  # erode back down to net `margin`

    if site.geom_type != "Polygon":
        print(f"derive_site: result is a {site.geom_type}, not a single polygon -- cannot write COL-SITE from this.")
        return 1

    out_path = args.out or args.dxf.with_name(f"{args.dxf.stem}-site-draft.dxf")
    _write_output(src, site, out_path)
    _log(args.dxf, len(polygons), skipped, margin, hull_used, out_path)

    print(
        f"derive_site: unioned {len(polygons)} ring(s) from {sorted(layers)} "
        f"({skipped} skipped), net margin {margin:.1f} ft"
        f"{f' (gap-bridged with {gap_bridge:.1f} ft, eroded back down)' if union.geom_type == 'MultiPolygon' and not hull_used else ''}"
        f"{f', convex hull used (--gap-bridge {gap_bridge:.1f} ft was not enough to merge every cluster -- REVIEW CAREFULLY)' if hull_used else ''}. "
        f"Wrote {out_path} on {SITE_DRAFT_LAYER[0]} -- review against the plan before "
        "moving anything onto COL-SITE."
    )
    return 0


def _write_output(src, site: Polygon, out_path: Path) -> None:
    doc = ezdxf.new(dxfversion=src.dxfversion)
    doc.header["$INSUNITS"] = src.header.get("$INSUNITS", doc.header["$INSUNITS"])
    doc.header["$MEASUREMENT"] = src.header.get("$MEASUREMENT", doc.header["$MEASUREMENT"])
    msp = doc.modelspace()
    name, color = SITE_DRAFT_LAYER
    if name not in doc.layers:
        doc.layers.add(name, color=color)
    msp.add_lwpolyline(list(site.exterior.coords), close=True, dxfattribs={"layer": name})
    doc.saveas(out_path)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="DXF exported from AutoCAD (DXFOUT) with COL-* rings finalised")
    p.add_argument("--layers", default=",".join(LAYERS_DEFAULT), help=f"comma-separated, default: {','.join(LAYERS_DEFAULT)}")
    p.add_argument("--margin", type=float, default=MARGIN_FT_DEFAULT, dest="margin_ft", help="FINAL net safety buffer in FEET regardless of --units -- not the gap-bridging distance (see --gap-bridge)")
    p.add_argument("--gap-bridge", type=float, default=GAP_BRIDGE_FT_DEFAULT, dest="gap_bridge_ft", help="how far (FEET) to dilate to merge a disconnected plot cluster before eroding back down to --margin")
    p.add_argument("--curve-tolerance", type=float, default=CURVE_TOLERANCE_DEFAULT)
    p.add_argument("--out", type=Path, default=None, help="default: <dxf>-site-draft.dxf")
    p.add_argument("--units", choices=("ft", "m"), default="ft", help="what unit the DRAWING itself uses -- only affects --margin/--gap-bridge's conversion")
    return p.parse_args()


def _log(dxf_path: Path, ring_count: int, skipped: int, margin: float, hull_used: bool, out_path: Path) -> None:
    log_path = dxf_path.with_name(f"{dxf_path.stem}-cv-log.txt")
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = (
        f"{stamp}  derive_site: {ring_count} ring(s) unioned ({skipped} skipped), "
        f"margin {margin:.1f} ft, {'hull' if hull_used else 'buffer'} boundary -> {out_path.name}\n"
    )
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line)


if __name__ == "__main__":
    sys.exit(main())
