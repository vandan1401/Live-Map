---
name: review-comment-asserts-unimplemented
description: This repo's code carries unusually long intent-stating comments; treat each one as a testable claim about the adjacent code — four times the comment was right about intent and wrong about effect, including a CSS comment a later diff falsified.
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
3. 2026-08-14 (plan 07, M7) — `apps/map/public/sw.js:3-4` header: "the activate handler
   deletes every cache that isn't the current name, which is what makes a deploy actually
   replace the old worker instead of leaving stale assets." Line 48-49 of the *same file*
   states the opposite and is correct: `sw.js`'s bytes don't change on an app-code deploy,
   so neither `install` nor `activate` ever re-runs, and nothing ever prunes
   `/assets/<hash>` entries. Two comments in one file contradicting each other is the
   cheapest possible tell — **when a file's header claims a mechanism, grep the same file
   for a later comment admitting it doesn't fire.**

4. 2026-08-15 (plan 08 diff) — `colony-theme.css:142-145`: "Top-left is the one corner not
   already used by `.colony-scale-note` (bottom-left) or `.colony-dev-click-badge`
   (top-right)" guarding `.colony-freshness-indicator` (`top/left: 0.75rem; z-index: 1000`).
   The same diff added `.colony-back-button` at `top/left: 0.75rem; z-index: 1100` with an
   opaque background in `map-toolbar.css`, burying the always-visible age label, and left the
   comment claiming the corner is free. **The map container's absolutely-positioned chrome is
   spread across three stylesheets — before accepting any new `position: absolute` overlay,
   grep `src/styles/*.css` for `position: absolute` and compare top/left/right/bottom +
   z-index yourself.**

**How to apply:** for CSS especially, do the specificity/cascade arithmetic yourself rather
than accepting a comment's claim about which rule wins — `!important` scoped to one selector
says nothing about selectors it does not match. Related:
[[review-docs-vs-enforcement-drift]], [[review-attribution-fallbacks]].
