"""Emit colony.svg per contract/SPEC.md (M13, spec/13-pipe-derive-export.md). Geometry only
-- class, id, data-* and nothing else. Zero fill/stroke/style attributes on any emitted
element; the one fallback <style> block is a plain CSS text node, not a presentation
attribute, so it does not trip that rule.
"""

from __future__ import annotations

from collections.abc import Sequence

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from pipeline.export import feature_svg_id
from pipeline.export.normalise import VIEWBOX_WIDTH_PX, Transform, apply_transform
from pipeline.export.svg_paths import polygon_to_path_d
from pipeline.extract.types import Point, Ring
from pipeline.geom import centroid
from pipeline.matching.assign import MatchedPlot
from pipeline.matching.classify import ClassifiedFeature

# A small circle marker in the normalised px space -- deliberately not proportional to any
# real-world tree size, just a fixed, legible dot. <use> MUST carry explicit width/height:
# without them it defaults to 100% of the viewport and every tree covers the whole map
# (contract/SPEC.md's own documented failure, already happened once).
TREE_CANOPY_WIDTH_PX = 6.0
TREE_CANOPY_HEIGHT_PX = 6.0

# `svg:root` matches only the <svg> element that is the document's own root -- true when
# this file is opened standalone (file:// during QA), false once the app's parseColonySvg.ts
# inlines it into the live HTML document (it becomes a nested element, not the root, there).
# An unscoped rule here becomes a real document stylesheet and out-cascades the app's own
# colony-theme.css/plot-selection.css for every colony on the page, not just this file's
# fallback -- found by /review, 2026-08-20.
_FALLBACK_STYLE = (
    "svg:root .site-boundary{fill:none;stroke:#333}"
    "svg:root .road{fill:#ccc}"
    "svg:root .garden,svg:root .amenity,svg:root .water{fill:#bcd9a8}"
    "svg:root .plot{fill:#eee;stroke:#999}"
    "svg:root .plot-label,svg:root .feature-label,svg:root .entrance-label"
    "{font:10px sans-serif;fill:#333}"
    "svg:root .tree-crown{fill:#4f7a44}"
)


def build_svg(
    t: Transform,
    site: Ring,
    road: BaseGeometry,
    plots: Sequence[MatchedPlot],
    features: Sequence[ClassifiedFeature],
    trees: tuple[Point, ...],
    colony_id: str,
) -> str:
    viewbox = f"0 0 {VIEWBOX_WIDTH_PX} {t.height_px:.2f}"
    tree_symbol = (
        '<defs><symbol id="tree-canopy" viewBox="0 0 10 10">'
        '<circle class="tree-crown" cx="5" cy="5" r="4"/></symbol></defs>'
    )
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" data-colony="{colony_id}">',
        f"<style>{_FALLBACK_STYLE}</style>",
        tree_symbol,
        '<g class="site">',
        f'<path class="site-boundary" d="{polygon_to_path_d(Polygon(site.points), t)}"/>',
        f'<path class="road" d="{polygon_to_path_d(road, t)}"/>',
    ]

    for feature in sorted(features, key=feature_svg_id):
        svg_id = feature_svg_id(feature)
        d = polygon_to_path_d(Polygon(feature.ring.points), t)
        lines.append(
            f'<path class="{feature.feature_class}" data-kind="{feature.kind}" '
            f'id="{svg_id}" d="{d}"/>'
        )

    ordered_plots = sorted(plots, key=lambda p: p.svg_id)
    for plot in ordered_plots:
        d = polygon_to_path_d(Polygon(plot.ring.points), t)
        lines.append(f'<path class="plot" id="{plot.svg_id}" d="{d}"/>')

    for plot in ordered_plots:
        cx, cy = apply_transform(t, centroid(plot.ring))
        lines.append(
            f'<text class="plot-label" data-plot="{plot.svg_id}" x="{cx:.2f}" '
            f'y="{cy:.2f}">{int(plot.number)}</text>'
        )

    for tx, ty in trees:
        px, py = apply_transform(t, (tx, ty))
        x = px - TREE_CANOPY_WIDTH_PX / 2
        y = py - TREE_CANOPY_HEIGHT_PX / 2
        lines.append(
            f'<use class="tree" href="#tree-canopy" x="{x:.2f}" y="{y:.2f}" '
            f'width="{TREE_CANOPY_WIDTH_PX:.2f}" height="{TREE_CANOPY_HEIGHT_PX:.2f}"/>'
        )

    lines.append("</g>")
    lines.append("</svg>")
    return "\n".join(lines)
