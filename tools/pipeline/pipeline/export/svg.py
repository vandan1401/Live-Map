"""Emit colony.svg per contract/SPEC.md (M13, spec/13-pipe-derive-export.md). Geometry only
-- class, id, data-* and nothing else. Zero fill/stroke/style attributes on any emitted
element; the one fallback <style> block is a plain CSS text node, not a presentation
attribute, so it does not trip that rule.
"""

from __future__ import annotations

from collections.abc import Sequence
from xml.sax.saxutils import escape

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from pipeline.export import feature_svg_id
from pipeline.export.normalise import VIEWBOX_WIDTH_PX, Transform, apply_transform
from pipeline.export.svg_paths import polygon_to_path_d
from pipeline.extract.types import Label, Point, Ring
from pipeline.geom import centroid
from pipeline.matching.assign import MatchedPlot
from pipeline.matching.classify import ClassifiedFeature

# A small circle marker in the normalised px space -- deliberately not proportional to any
# real-world tree size, just a fixed, legible dot. <use> MUST carry explicit width/height:
# without them it defaults to 100% of the viewport and every tree covers the whole map
# (contract/SPEC.md's own documented failure, already happened once).
TREE_CANOPY_WIDTH_PX = 6.0
TREE_CANOPY_HEIGHT_PX = 6.0

# Feature kinds whose <text> is withheld from the emitted SVG, owner-tuned per colony review
# (docs/plans/19.md addendum, 2026-08-24) -- a presentation choice, not a classification one:
# the feature's polygon/data-kind/manifest entry are unaffected, so un-hiding a kind is a
# one-line edit here, never a re-export. See build_svg's feature-label loop.
_HIDDEN_FEATURE_KINDS = frozenset({"park", "reserved", "other"})

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
    feature_labels: Sequence[Label],
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

    # A blockless and a lettered plot can share the same padded number (docs/plans/16.md) --
    # only prefix with the block when the colony actually mixes blocks, so a normal
    # single-block colony's labels are unchanged.
    mixed_blocks = len({plot.block for plot in ordered_plots}) > 1
    for plot in ordered_plots:
        cx, cy = apply_transform(t, centroid(plot.ring))
        label_text = (
            f"{plot.block}-{int(plot.number)}"
            if (plot.block and mixed_blocks)
            else str(int(plot.number))
        )
        # data-rotation/data-label-height carry the CAD operator's own choice of how each
        # label sits on its plot (docs/plans/17.md, 2026-08-21) -- data-* only, per
        # invariant 1 (no style/transform baked into the SVG itself); apps/map applies
        # them at runtime the same way it already applies data-status. Negated: DXF
        # rotation is CCW from +X in a Y-up frame, and apply_transform flips Y, which
        # mirrors rotation direction (tier-1.md: "Y is flipped ... needs its own test").
        attrs = f' data-rotation="{-plot.label.rotation_deg:.2f}"'
        if plot.label.height is not None:
            attrs += f' data-label-height="{plot.label.height * t.scale:.2f}"'
        lines.append(
            f'<text class="plot-label" data-plot="{plot.svg_id}"{attrs} x="{cx:.2f}" '
            f'y="{cy:.2f}">{label_text}</text>'
        )

    # One <text class="feature-label"> per COL-FEATURE-NO label, matched-to-a-ring or not
    # (docs/plans/19.md) -- a label that classify_features() couldn't match to any
    # garden/amenity/water ring is a free-floating road/pathway annotation ("9.0 M W ROAD"),
    # rendered at its own DXF insertion point exactly like a matched one is. Emitted after the
    # plot paths/labels so a label sitting near a plot edge still paints on top, same as
    # plot-label already does. Sorted by handle for deterministic output, same principle as
    # `features`/`ordered_plots` above. Text is free-form CAD-operator text (unlike a plot
    # number, never regex-validated) -- escaped, or an "&"/"<" in a label breaks the emitted
    # XML and apps/map's DOMParser silently renders an empty map (invariant 1, /review
    # 2026-08-24). data-rotation/data-label-height mirror plot-label's exactly (owner ask,
    # 2026-08-24 addendum to docs/plans/19.md: use the DWG's own font size and rotation, not
    # a fixed constant) -- apps/map's drawLabels.ts falls back to a constant only when the
    # source entity carried no height.
    #
    # `park`/`reserved`/`other`-kind feature labels are withheld for now (owner, 2026-08-24:
    # first "hide the park", then "hide the reserved and other also") -- presentation only,
    # not classification: each feature's polygon/data-kind/manifest entry are unaffected, so
    # this is reversible per-kind without a re-export, just by editing this set. A
    # road/pathway annotation (matched to no ring) is never in `features`, so it can never be
    # in this set -- road texts stay visible regardless of which kinds are hidden here.
    hidden_label_handles = {
        feature.label.handle for feature in features if feature.kind in _HIDDEN_FEATURE_KINDS
    }
    for label in sorted(feature_labels, key=lambda lbl: lbl.handle):
        if label.handle in hidden_label_handles:
            continue
        lx, ly = apply_transform(t, label.point)
        attrs = f' data-rotation="{-label.rotation_deg:.2f}"'
        if label.height is not None:
            attrs += f' data-label-height="{label.height * t.scale:.2f}"'
        lines.append(
            f'<text class="feature-label"{attrs} x="{lx:.2f}" y="{ly:.2f}">{escape(label.text)}</text>'
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
