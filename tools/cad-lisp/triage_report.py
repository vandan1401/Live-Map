#!/usr/bin/env python3
"""Rank every suspicious polygon from a CV-MERGED DXF for manual review -- the punch
list for close_polygons.py's output. Three categories, since polygon size alone can't
tell them apart:

  FUSED           2+ plot-number labels inside one polygon -- a missing internal wall.
  NON-PLOT        oversized, but a road/park/land descriptive label (see --other-pattern)
                  sits inside it -- confirmed not a plot problem, nothing to fix.
  UNCONFIRMED     oversized, no plot label AND no descriptive label inside -- genuinely
                  needs your eyes: could be a block missing its whole plot layout and
                  labels, or a descriptive label just outside where I expected it.

The giant site-boundary ring is excluded automatically (anything covering most of the
site's own extent), and thin sliver artifacts are trimmed via --min-width-ft before any
of this runs, so they don't pollute the oversized bucket.

Usage:
    python triage_report.py path/to/export.dxf --gap-tolerance 2
    python triage_report.py path/to/export.dxf --gap-tolerance 2 --min-width-ft 1 --units m
"""

from __future__ import annotations

import argparse
import re
import statistics
import sys
from pathlib import Path

import ezdxf
from shapely.geometry import Point, Polygon

from labels import DEFAULT_LABEL_PATTERN, find_plot_labels
from polygonize import bridge_gaps, collect_loose_endpoints, flatten_entities, trace_polygons

SOURCE_TYPES = {"LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE"}
SIZE_RATIO_DEFAULT = 2.5  # a polygon over this many times the median plot area gets reviewed
SITE_SPAN_RATIO = 0.6  # a polygon covering this much of the site's own extent is a
# boundary ring (site/block outline), not a plot-fusion -- excluded automatically
OTHER_PATTERN_DEFAULT = r"ROAD|PARK|PATHWAY|GARDEN|LAND|PLANING|PLANNING"
FT_PER_M = 0.3048


def main() -> int:
    args = _parse_args()
    src = ezdxf.readfile(args.dxf)
    msp = src.modelspace()

    entities = [e for e in msp if e.dxf.layer == args.layer and e.dxftype() in SOURCE_TYPES]
    paths = flatten_entities(entities, args.curve_tolerance)
    loose = collect_loose_endpoints(paths)
    bridges, flags = bridge_gaps(loose, paths, args.gap_tolerance)
    min_width = args.min_width_ft * (FT_PER_M if args.units == "m" else 1.0)
    polygons = trace_polygons(paths, bridges, min_width)

    all_text = [e for e in msp if e.dxftype() in ("MTEXT", "TEXT")]
    plot_labels = find_plot_labels(all_text, args.label_pattern)
    label_points = [(name, Point(x, y)) for name, (x, y), _e in plot_labels]
    plot_texts = {name for name, _pt in label_points}
    other_points = _other_labels(all_text, plot_texts, args.other_pattern)

    site_w, site_h = _site_extent(polygons)
    median = statistics.median(p.area for p in polygons)
    threshold = median * args.size_ratio

    fused: list[tuple[Polygon, list[str]]] = []
    non_plot: list[tuple[Polygon, list[str]]] = []
    unconfirmed: list[tuple[Polygon, list[str]]] = []
    for p in polygons:
        minx, miny, maxx, maxy = p.bounds
        if (maxx - minx) > SITE_SPAN_RATIO * site_w and (maxy - miny) > SITE_SPAN_RATIO * site_h:
            continue  # site/block boundary ring, not a plot-fusion candidate
        names = [name for name, pt in label_points if p.contains(pt)]
        if len(names) > 1:
            fused.append((p, names))
            continue
        if p.area <= threshold:
            continue
        others = [text for text, pt in other_points if p.contains(pt)]
        (non_plot if others else unconfirmed).append((p, others))

    fused.sort(key=lambda x: -len(x[1]))
    non_plot.sort(key=lambda x: -x[0].area)
    unconfirmed.sort(key=lambda x: -x[0].area)

    print(f"{len(polygons)} polygons traced, median plot area {median:.1f} sqm\n")
    _print_group("FUSED -- missing internal wall", fused)
    _print_group("NON-PLOT -- road/park/land, confirmed, nothing to fix", non_plot)
    _print_group("UNCONFIRMED -- oversized, unlabeled, needs your eyes", unconfirmed)
    return 0


def _other_labels(all_text: list, plot_texts: set[str], pattern: str) -> list[tuple[str, Point]]:
    regex = re.compile(pattern, re.I)
    out = []
    for e in all_text:
        text = (e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text).strip()
        if text in plot_texts or not regex.search(text):
            continue
        pt = e.dxf.insert
        out.append((text, Point(pt[0], pt[1])))
    return out


def _print_group(title: str, rows: list[tuple[Polygon, list[str]]]) -> None:
    print(f"--- {title}: {len(rows)} ---")
    for p, names in rows:
        c = p.centroid
        minx, miny, maxx, maxy = p.bounds
        label = f"{names[:6]}" if names else "no labels inside"
        print(f"  area={p.area:8.1f} sqm  extent={maxx-minx:5.1f}x{maxy-miny:5.1f}  "
              f"center=({c.x:.1f},{c.y:.1f})  {label}")
    print()


def _site_extent(polygons: list[Polygon]) -> tuple[float, float]:
    allx = [x for poly in polygons for x, y in poly.exterior.coords]
    ally = [y for poly in polygons for x, y in poly.exterior.coords]
    return max(allx) - min(allx), max(ally) - min(ally)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path)
    p.add_argument("--layer", default="CV-MERGED")
    p.add_argument("--gap-tolerance", type=float, default=0.5)
    p.add_argument("--curve-tolerance", type=float, default=0.05)
    p.add_argument("--label-pattern", default=DEFAULT_LABEL_PATTERN)
    p.add_argument("--other-pattern", default=OTHER_PATTERN_DEFAULT, help="regex for non-plot descriptive labels")
    p.add_argument("--size-ratio", type=float, default=SIZE_RATIO_DEFAULT)
    p.add_argument("--min-width-ft", type=float, default=0.0, dest="min_width_ft")
    p.add_argument("--units", choices=("ft", "m"), default="ft", help="what unit the drawing itself uses")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(main())
