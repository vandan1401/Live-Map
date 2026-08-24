# D-122: Unmatched `COL-FEATURE-NO` labels are road annotations; per-kind text visibility is pipeline-side

**Status:** accepted
**Date:** 2026-08-24
**Context:** docs/plans/19.md — the pipeline emitted zero `feature-label` text for any real
colony (only `plot-label`); the owner asked for road/pathway width texts ("9.0 M W ROAD")
and classified-feature text (garden/amenity/water, including "Future planning"/reserved) to
both render, then in the same session asked to withhold `park`/`reserved`/`other`-kind text
specifically, keeping it reversible.

## Decision

Two related choices, made the same session:

1. **A `COL-FEATURE-NO` label whose insertion point falls inside no
   `COL-GARDEN`/`COL-AMENITY`/`COL-WATER` ring is not a matching error — it is a
   free-floating road/pathway annotation**, rendered at its own DXF point with no `kind` and
   no ring association. `pipeline.matching.match_labels_to_rings` gained a keyword-only
   `allow_unmatched_labels` parameter (default `False`); `classify.py`'s `classify_features`
   is the only caller that passes `True`. `assign_plot_numbers` (plot-number matching) never
   does — that path stays exactly as strict as before (tier-1.md, "Matching is identity").
2. **Which feature kinds show text at all is a pipeline-side, per-kind toggle
   (`pipeline/export/svg.py`'s `_HIDDEN_FEATURE_KINDS`), not something `apps/map` filters.**
   A hidden kind's `<path>`/`data-kind`/manifest entry are untouched — only its `<text>` is
   withheld — so changing which kinds show is a one-line edit to that set, never a
   re-export, and never an app-side conditional that could let two colonies with identical
   SVG data render differently depending on which app build loaded them (D-004's
   "the theme/renderer is the only variable" guarantee, extended to label visibility).

## Why

**(1) Road annotations, not errors.** D-104 already established that roads have no source
layer — they're derived by subtraction. A road-width text is real CAD-operator intent
(matches `docs/cad-layer-standard.md`'s "Feature labels" section point of the DXF being the
single source of truth), but it can never be "inside its own feature" the way a garden/
amenity label is, because there is no ring for it to be inside. Treating "matches zero rings"
as a hard, unconditional error (D-118's general stance on ambiguity) would make the export
reject a colony the moment its operator drew a completely standard, wanted piece of text —
that is over-applying "ambiguity is a hard error" to a case that was never ambiguous, just
outside the ring-classification model. The keyword-matched ambiguity guarantees (D-118,
"a label matching nothing is rejected") stay exactly as strict for labels that *do* fall
inside a ring — this decision narrows the scope of the strict rule, it does not remove it.

**(2) Pipeline-side visibility toggle, not app-side filtering.** The owner's ask ("hide park
… we might use it later," then "hide reserved and other also") arrived twice in one session
and will likely change again. Two ways to implement a toggle were available: filter in
`apps/map`'s renderer (per-kind `if` in `drawLabels.ts`), or filter in the pipeline before
the text ever reaches the SVG. The renderer approach was rejected because it breaks D-004's
"one variable, every colony" guarantee for label visibility specifically: two colonies with
byte-identical `<text class="feature-label" data-kind="park">` markup would render
differently depending on which build of `apps/map` loaded them, and a colony viewed offline
via a stale PWA cache could show stale label-visibility rules independent of the current
toggle state. The pipeline-side toggle keeps the SVG's own content as the single source of
truth for what's currently visible, matching the same principle D-025 and D-004 already
apply elsewhere ("the SVG is what's authoritative").

## Rejected alternatives

- **Add `ROAD`/`PATHWAY` to `_KEYWORD_TABLE` and classify road texts as a feature kind.**
  Rejected: a road/pathway annotation has no polygon, so it cannot become a
  `ClassifiedFeature` (which requires a ring) without inventing a synthetic ring or making
  `class`/`area_sqft` nonsensical in the manifest. It is fundamentally a different kind of
  thing — text with no shape — not a new member of an existing enum.
- **Keep `match_labels_to_rings` strict for everyone and give `classify_features` its own,
  separate un-matched-label collection function.** Rejected as needless duplication of the
  containment loop; a single keyword-only parameter with a safe default (`False`, preserving
  every existing caller's behaviour unchanged) is a smaller, more reviewable diff and keeps
  the one shared containment test spec/12 established.
- **Filter hidden kinds in `apps/map`'s `drawLabels.ts` via a config list.** Rejected per the
  "why" above — this is the alternative that was seriously considered and set aside, not a
  strawman: it would have been less pipeline code, but it moves the single source of truth
  for "what does this colony currently show" into the app, which D-004 exists specifically
  to prevent.

## Consequences

- `_HIDDEN_FEATURE_KINDS` currently hides `park`, `reserved`, `other` — this is a live,
  owner-tunable value, not a permanent design stance. A future session should not "restore"
  park text without checking whether the owner's preference has changed again.
- A colony whose `COL-FEATURE-NO` labels are entirely within `_HIDDEN_FEATURE_KINDS`, and
  which has no road/pathway annotations, will legitimately export with zero visible
  `feature-label` text — this is expected, not a bug, and re-exporting will not "fix" it;
  only widening `_HIDDEN_FEATURE_KINDS` or adding annotation text in AutoCAD will.
- Any future "presentation toggle" of this shape (visible-but-classified vs. hidden) should
  follow the same pipeline-side-constant pattern, not introduce app-side filtering.
