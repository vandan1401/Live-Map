---
name: review-comment-asserts-unimplemented
description: This repo's code carries unusually long intent-stating comments; treat each one as a testable claim about the adjacent code, because twice the comment was right and the code did not deliver it.
metadata:
  type: feedback
---

Every non-trivial block in `apps/map/` is preceded by a paragraph explaining what it
guarantees. Read those paragraphs as assertions to falsify against the lines directly below
them, not as documentation to trust.

**Why:** the comments are accurate about *intent* and have twice been wrong about *effect* —
and because they read as authoritative, they are exactly what makes a reviewer skim.

Occurrences:
1. 2026-08-14 — `colony-theme.css:130` "Always wins over the legend filter below (a selected
   plot should read as 'in focus' no matter what's filtered)". The rule below it only sets
   `opacity: 0.35 !important` on `.plot:not(.is-selected)`. Nothing lifts the *selected*
   plot above `.filter-active .plot { opacity: 0.2 }`, so selecting a filtered-out plot
   makes it the faintest thing on screen — the opposite of the stated guarantee.
2. 2026-08-14 — `fixtures/shree-vatika-2/colony.json`, plan 05 §2.2: "`facing` inferred from
   which side of its block faces a road … documented per block in the generator script, not
   hand-guessed per plot". `facing` held up; `is_corner` in the same sentence did not.
   See [[review-fixture-geometry-unchecked]].

**How to apply:** for CSS especially, do the specificity/cascade arithmetic yourself rather
than accepting a comment's claim about which rule wins — `!important` scoped to one selector
says nothing about selectors it does not match. Related:
[[review-docs-vs-enforcement-drift]], [[review-attribution-fallbacks]].
