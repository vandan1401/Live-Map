"""Feature classification: layer -> class, COL-FEATURE-NO label -> kind (M12,
spec/12-pipe-matching.md, docs/plans/13.md).

Area clustering, the keyword ladder over the ring's own geometry, and "unclassified
defaults to garden" are all deleted under D-118 -- they were inference over an unlabelled
drawing. `class` comes straight from the layer; `kind` comes straight from the feature
label, matched against the keyword table. A label matching nothing is rejected, not
defaulted.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from pipeline.extract.types import Label, Ring
from pipeline.matching import MatchingError, match_labels_to_rings

_LAYER_CLASS = {
    "COL-GARDEN": "garden",
    "COL-AMENITY": "amenity",
    "COL-WATER": "water",
}

# docs/cad-layer-standard.md's feature keyword table, codified. Checked in this order;
# the first matching group wins (docs/plans/13.md pins this as the tie-break). "PARKING"
# must be checked before "PARK" -- it is a substring of it, so the reverse order makes
# every "PARKING" label silently classify as "park" instead (found by /review, 2026-08-20).
# Keep this table, that doc's table, and contract/colony.schema.json's `kind` enum in sync
# -- a doc edit that adds a keyword without updating the other two is a /review finding
# (this exact drift happened once already, 2026-08-20).
_KEYWORD_TABLE: tuple[tuple[tuple[str, ...], str], ...] = (
    (("CLUB", "COMMUNITY"), "clubhouse"),
    (("PARKING",), "parking"),
    (("GARDEN", "PARK", "OPEN SPACE", "GREEN"), "park"),
    (("TEMPLE", "MANDIR"), "temple"),
    (("OHT", "TANK", "SUMP"), "tank"),
    (("RESERVED",), "reserved"),
    (("OTHER",), "other"),
)


@dataclass(frozen=True)
class ClassifiedFeature:
    """One garden/amenity/water ring, resolved to its class and kind."""

    ring: Ring
    label: Label
    feature_class: str
    kind: str


def classify_features(
    rings: Sequence[Ring], labels: Sequence[Label]
) -> tuple[ClassifiedFeature, ...]:
    pairs = match_labels_to_rings("feature", rings, labels, allow_unmatched_labels=True)

    features: list[ClassifiedFeature] = []
    for ring, label in pairs:
        feature_class = _LAYER_CLASS.get(ring.layer)
        if feature_class is None:
            raise MatchingError(f"{ring.layer} entity {ring.handle} is not a feature layer")
        features.append(
            ClassifiedFeature(
                ring=ring, label=label, feature_class=feature_class, kind=_resolve_kind(label)
            )
        )
    return tuple(features)


def _resolve_kind(label: Label) -> str:
    text = label.text.upper()
    for keywords, kind in _KEYWORD_TABLE:
        if any(keyword in text for keyword in keywords):
            return kind
    raise MatchingError(f"{label.layer} label {label.handle} ('{label.text}') matches no keyword")
