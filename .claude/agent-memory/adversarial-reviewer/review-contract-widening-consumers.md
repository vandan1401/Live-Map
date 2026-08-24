---
name: review-contract-widening-consumers
description: Widening a contract pattern (e.g. svg_id gaining a blockless plot-07 shape) is only "additive" for validators — consumers that relied on the old shape's incidental guarantees (sort order, label uniqueness, parseability) silently change meaning. Enumerate them.
metadata:
  type: feedback
---

When a `contract/` pattern is widened, a diff that only touches *validators* (schema, regex,
parser, TS types) is incomplete. List every consumer that depended on a guarantee the old,
narrower shape happened to provide, and check each one is either fixed or recorded.

**Why:** the schema change is trivially reviewable and looks additive ("strict superset, no
previously-valid value becomes invalid"), so the review attention goes there. The defects
live in code that never validates anything and therefore never appears in the diff.

Occurrences (both from plan 15, blockless plot ids):

1. `apps/map/src/lib/db/plots.ts:40` — `.order("svg_id")` with a comment asserting lexical
   order == manifest order. `plot-07` sorts before every `plot-A-…`. Pinned as accepted in
   the plan; the code comment was only added after a review flagged it.
2. `tools/pipeline/pipeline/export/svg.py:86` — the map label is `{int(plot.number)}`, so in
   the very colony the plan exists for (bare `1`–`6` **and** explicit `A-1`–`A-6`),
   `plot-01` and `plot-A-01` both render the text "1". The plan's failure-mode walk claimed
   "silent re-identification" was covered by `assign_plot_numbers`'s `seen` dict — that
   covers the *id*, not the human-visible label the id is for.

3. 2026-08-24 (plan 19) — widening *what may appear inside* the SVG, not a field's shape.
   `svg.py::build_svg` began interpolating raw `label.text` (arbitrary CAD-operator text from
   `COL-FEATURE-NO`) into a `<text>` node. Every prior text node was constrained
   (`int(plot.number)`, config-derived block letters), so nothing in the pipeline escapes XML.
   A label containing `&` or `<` ("PARK & GARDEN") emits malformed XML;
   `colonyModel.ts::parseColonyModel` uses `DOMParser().parseFromString(raw, "image/svg+xml")`
   and never checks for `parsererror`, so the app renders an empty map with no error — the
   exact blast radius invariant 1 names. `run_qa` has no XML-wellformedness check.
   **Rule: whenever a diff first routes operator/user-supplied text into an emitted SVG/XML/
   HTML string, check for escaping, and check the parser on the other side for a
   `parsererror` branch.** Verified by running `build_svg` with `PARK & GARDEN <A>` and
   `ET.fromstring` — "not well-formed (invalid token)".

**How to apply:** grep for the widened field name across both halves and sort the hits into
"validates it" vs "assumes something about it" — ordering, uniqueness of the rendered form,
substring/prefix parsing, string concatenation. Only the second group is worth reviewing.
Related: [[review-comment-asserts-unimplemented]], [[review-docs-vs-enforcement-drift]].
