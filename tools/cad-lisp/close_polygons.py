#!/usr/bin/env python3
"""Close plot polygons from a CV-MERGED DXF export -- the Python replacement for
CV-CLOSE's AutoCAD boundary sweep, which does not scale to a real colony (see
tools/cad-lisp/README.md). Reads LINE/LWPOLYLINE/POLYLINE/ARC/CIRCLE entities on one
layer, bridges small gaps, traces every closed region, and writes a new DXF with the
traced regions on CV-PLOT-DRAFT and any unresolved gaps flagged on CV-FLAGS -- the same
scratch layers CV-CLOSE would have produced, so the README's existing review-before-
promoting-to-COL-PLOT step still applies. Nothing here writes to COL-* layers directly.

Also cross-checks plot-number labels (MTEXT/TEXT matching --label-pattern, anywhere in
the drawing by default) against the traced polygons: a polygon count that looks short of
the real plot count usually isn't missing geometry, it's several plots fused into one
polygon by an unclosed internal wall -- every label is present, just not separated. Marks
each fused polygon (2+ labels inside it) on CV-MULTI with the plot numbers involved, and
any label that lands inside no polygon at all on CV-MISSING. Use --no-labels to skip this
if a colony's numbering doesn't fit --label-pattern and produces noise.

The original --layer lines are also copied into the output, as one whole block (so it can
be moved as a unit) beside the traced result -- your full-drawing backup copy. --no-source
skips it; --offset-ratio changes the gap; --overlay places the traced result at the exact
same coordinates as the source instead (pair with --no-source-block so a single source
line can be EXTENDed without exploding). Separately and unconditionally: every original
line with an endpoint CV-CLOSE(py) couldn't resolve (the ones behind CV-FLAGS) is also
copied loose onto CV-UNCLOSED at the *same* coordinates as the traced side, plus the
matched plot-number labels onto CV-PLOT-LABELS -- so the output is self-sufficient: EXTEND
a CV-UNCLOSED line onto a CV-PLOT-DRAFT edge and rerun this script directly on its own
output (--layer CV-MERGED still finds your fixed lines once you move them to that layer).

Usage:
    python close_polygons.py path/to/export.dxf
    python close_polygons.py path/to/export.dxf --gap-tolerance 0.5 --out draft.dxf
    python close_polygons.py path/to/export.dxf --no-labels

Workflow: in AutoCAD, run CV-LAYERS, CV-MERGE, fix any gaps you can see, CV-HIDETEXT,
then DXFOUT. Run this script on that DXF, then either work in its own output directly
(fix CV-UNCLOSED lines, rerun) or reimport into the original (open the output DXF, select
all, Ctrl+C, switch to the original, PASTEORIG) -- review before moving anything onto
COL-PLOT either way.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import ezdxf

from labels import DEFAULT_LABEL_PATTERN, Label, find_plot_labels, match_labels_to_polygons
from output import write_output
from polygonize import bridge_gaps, collect_loose_endpoints, flatten_entities, trace_polygons

SOURCE_LAYER_DEFAULT = "CV-MERGED"
SOURCE_TYPES = {"LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE"}
GAP_TOLERANCE_DEFAULT = 0.5  # drawing units (ft); matches CV-CLOSE's own default
CURVE_TOLERANCE_DEFAULT = 0.05  # ft; max deviation when flattening arcs to line segments
OFFSET_RATIO_DEFAULT = 0.1  # gap between the source copy and the traced copy, as a
# fraction of the source's own width -- wide enough to read as "two separate drawings"
FT_PER_M = 0.3048  # --min-width is given in feet regardless of the drawing's own units;
# --units states what the drawing actually uses so it converts correctly (D-119 follow-up:
# found a colony drawn in metres, not the "1 unit = 1 ft" cv-tools.lsp assumes)


def main() -> int:
    args = _parse_args()
    src = ezdxf.readfile(args.dxf)
    entities = [
        e for e in src.modelspace() if e.dxf.layer == args.layer and e.dxftype() in SOURCE_TYPES
    ]
    if not entities:
        print(f"close_polygons: no {sorted(SOURCE_TYPES)} entities on layer '{args.layer}'.")
        return 1

    paths = flatten_entities(entities, args.curve_tolerance)
    loose = collect_loose_endpoints(paths)
    bridges, flags = bridge_gaps(loose, paths, args.gap_tolerance)
    min_width = args.min_width_ft * (FT_PER_M if args.units == "m" else 1.0)
    polygons = trace_polygons(paths, bridges, min_width)

    fused: dict[int, list[str]] = {}
    missing: list[Label] = []
    label_entities_matched: list = []
    if not args.no_labels:
        label_entities = [
            e
            for e in src.modelspace()
            if e.dxftype() in ("MTEXT", "TEXT")
            and (args.label_layer is None or e.dxf.layer == args.label_layer)
        ]
        plot_labels = find_plot_labels(label_entities, args.label_pattern)
        label_entities_matched = [e for _, _, e in plot_labels]
        by_polygon, missing = match_labels_to_polygons(plot_labels, polygons)
        fused = {i: names for i, names in by_polygon.items() if len(names) > 1}

    out_path = args.out or args.dxf.with_name(f"{args.dxf.stem}-plot-draft.dxf")
    source_entities = [] if args.no_source else entities
    unclosed_idx = {idx for _, idx in flags}
    unclosed_entities = [entities[i] for i in sorted(unclosed_idx)]
    write_output(
        src, entities, source_entities, unclosed_entities, label_entities_matched,
        polygons, flags, fused, missing, out_path,
        args.offset_ratio, args.overlay, not args.no_source_block,
    )
    _log(args.dxf, len(polygons), len(bridges), len(flags), fused, missing)

    fused_plots = sum(len(names) for names in fused.values())
    print(
        f"close_polygons: {len(polygons)} closed region(s) traced, "
        f"{len(bridges)} gap(s) bridged, {len(flags)} endpoint(s) flagged, "
        f"{len(fused)} polygon(s) fusing {fused_plots} plot(s) together, "
        f"{len(missing)} label(s) with no enclosing polygon. Wrote {out_path}"
    )
    return 0


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="DXF exported from AutoCAD (DXFOUT) after CV-MERGE")
    p.add_argument("--layer", default=SOURCE_LAYER_DEFAULT, help=f"default: {SOURCE_LAYER_DEFAULT}")
    p.add_argument("--gap-tolerance", type=float, default=GAP_TOLERANCE_DEFAULT)
    p.add_argument("--curve-tolerance", type=float, default=CURVE_TOLERANCE_DEFAULT)
    p.add_argument("--out", type=Path, default=None, help="default: <dxf>-plot-draft.dxf")
    p.add_argument("--label-layer", default=None, help="default: scan every layer for MTEXT/TEXT")
    p.add_argument("--label-pattern", default=DEFAULT_LABEL_PATTERN, help="regex a plot number must fullmatch")
    p.add_argument("--no-labels", action="store_true", help="skip the plot-label cross-check entirely")
    p.add_argument(
        "--no-source",
        action="store_true",
        help="don't copy the original --layer lines into the output for comparison",
    )
    p.add_argument("--offset-ratio", type=float, default=OFFSET_RATIO_DEFAULT)
    p.add_argument(
        "--overlay",
        action="store_true",
        help="place the traced result at the SAME coordinates as the source (dx=0) "
        "instead of beside it -- overrides --offset-ratio",
    )
    p.add_argument(
        "--no-source-block",
        action="store_true",
        help="write source lines loose instead of as one block",
    )
    p.add_argument(
        "--min-width-ft",
        type=float,
        default=0.0,
        dest="min_width_ft",
        help="trim any polygon protrusion narrower than this (in FEET, always -- see "
        "--units) via erode-then-dilate; a polygon entirely thinner than this vanishes. "
        "0 (default) disables it",
    )
    p.add_argument(
        "--units",
        choices=("ft", "m"),
        default="ft",
        help="what unit the DRAWING itself uses -- only affects --min-width-ft's "
        "conversion, not --gap-tolerance/--curve-tolerance (those stay raw drawing units)",
    )
    return p.parse_args()


def _log(
    dxf_path: Path,
    polygon_count: int,
    bridge_count: int,
    flag_count: int,
    fused: dict[int, list[str]],
    missing: list[Label],
) -> None:
    log_path = dxf_path.with_name(f"{dxf_path.stem}-cv-log.txt")
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fused_plots = sum(len(names) for names in fused.values())
    line = (
        f"{stamp}  CV-CLOSE(py): {polygon_count} draft region(s), "
        f"{bridge_count} gap(s) bridged, {flag_count} flagged, "
        f"{len(fused)} fused polygon(s) ({fused_plots} plots), {len(missing)} label(s) missing a region\n"
    )
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line)


if __name__ == "__main__":
    sys.exit(main())
