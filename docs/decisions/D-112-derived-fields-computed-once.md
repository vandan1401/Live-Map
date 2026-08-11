# D-112 — `facing` and `is_corner` derived once at export, then stored

**Status:** accepted

## Decision

`facing`, `is_corner`, and `area_sqft` are computed in `pipeline/derive/`, written into the
manifest, and never recomputed downstream.

## Reasoning

Both fields carry a price premium in Indian plot sales — east and north-facing plots and
corner plots command more — so they are real business data, not decoration. Deriving them
from geometry saves the family typing two fields several hundred times per colony and
removes a whole class of transcription error.

Computing once and storing avoids the classic failure of two sources for one fact. If the
app recomputed `facing` at render time from the SVG, it could disagree with the manifest,
and the UI would show whichever it happened to read. Which one is "right" then becomes
unanswerable.

## Rejected alternatives

- **Recompute in the app** — no storage, and it puts geometry code in a repo that has
  deliberately been kept free of it.
- **Have the family type them** — several hundred entries per colony, each a chance to be
  wrong, for values that are already implicit in the drawing.

## Blast radius

Low. Both are additive manifest fields.
