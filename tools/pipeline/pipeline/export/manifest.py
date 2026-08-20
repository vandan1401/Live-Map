"""Emit colony.json per contract/colony.schema.json (M13, spec/13-pipe-derive-export.md).
`facing`/`is_corner` are passed in precomputed (pipeline.derive) rather than recomputed here
-- they are keyed by svg_id so this module stays pure bookkeeping, no geometry of its own
beyond area/length/breadth/centroid, which pipeline.geom already provides.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from pipeline.export import feature_svg_id
from pipeline.export.normalise import VIEWBOX_WIDTH_PX, Transform, apply_transform
from pipeline.extract.types import ColonyConfig, Ring
from pipeline.geom import area_sqft, centroid, simplify
from pipeline.matching.assign import MatchedPlot
from pipeline.matching.classify import ClassifiedFeature


def _rect_sides_ft(ring: Ring) -> tuple[float, float]:
    """length_ft is always the shorter side, breadth_ft the longer -- the convention read
    off every row of the existing hand-traced fixtures/shree-vatika-2/colony.json."""
    rect = simplify(ring)
    corners = list(rect.exterior.coords)[:3]
    side_a = math.dist(corners[0], corners[1])
    side_b = math.dist(corners[1], corners[2])
    return (side_a, side_b) if side_a <= side_b else (side_b, side_a)


def build_manifest(
    config: ColonyConfig,
    t: Transform,
    plots: Sequence[MatchedPlot],
    features: Sequence[ClassifiedFeature],
    north_deg: float,
    facings: Mapping[str, str],
    corners: Mapping[str, bool],
) -> dict[str, Any]:
    plots_out = []
    for plot in sorted(plots, key=lambda p: p.svg_id):
        length_ft, breadth_ft = _rect_sides_ft(plot.ring)
        cx, cy = apply_transform(t, centroid(plot.ring))
        plots_out.append(
            {
                "svg_id": plot.svg_id,
                "block": plot.block,
                "number": plot.number,
                "area_sqft": round(area_sqft(plot.ring)),
                "length_ft": round(length_ft, 2),
                "breadth_ft": round(breadth_ft, 2),
                "centroid": [round(cx, 2), round(cy, 2)],
                "facing": facings[plot.svg_id],
                "is_corner": corners[plot.svg_id],
                "confidence": "manual",  # D-118: no graduated-confidence ladder any more
            }
        )

    features_out = []
    for feature in sorted(features, key=feature_svg_id):
        cx, cy = apply_transform(t, centroid(feature.ring))
        features_out.append(
            {
                "svg_id": feature_svg_id(feature),
                "class": feature.feature_class,
                "kind": feature.kind,
                "label": feature.label.text,
                "centroid": [round(cx, 2), round(cy, 2)],
                "area_sqft": round(area_sqft(feature.ring)),
            }
        )

    return {
        "colony": {
            "id": config.id,
            "name": config.name,
            "viewbox": [0, 0, VIEWBOX_WIDTH_PX, round(t.height_px, 2)],
            "scale": {"px_per_ft": round(t.scale, 4)},
            "north_deg": north_deg,
            "generated": datetime.now(tz=UTC).date().isoformat(),
            "verified": False,  # D-108: no pipeline code path may ever write True
            "source": dict(config.source),
        },
        "plots": plots_out,
        "features": features_out,
    }
