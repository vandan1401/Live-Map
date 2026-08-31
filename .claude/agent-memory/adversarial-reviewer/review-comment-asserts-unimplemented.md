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

5. 2026-08-20 (plan 14, M13) — two in one diff, and the first one crosses the repo halves.
   (a) `tools/pipeline/pipeline/export/svg.py`'s module docstring: "the one fallback
   `<style>` block is a plain CSS text node, not a presentation attribute, so it does not
   trip that rule." True about the grep, false about the effect — the block is emitted into
   a file the app inlines into the live DOM, where it out-cascades `colony-theme.css` and
   `plot-selection.css`. **A pipeline-side comment can be wrong about an `apps/map` effect;
   the two halves' comments are never checked against each other.**
   (b) `tools/pipeline/tests/test_derive.py:34-40` — comment says "Pinning the literal
   expected value catches that", and the test body contains no literal, only
   `stable_seed(x) == stable_seed(x)`. **When a test's comment explains why a weaker check
   is insufficient, verify the stronger check is actually the one written.**

6. 2026-08-21 (plan 15) — `apps/map/src/lib/db/plots.ts:40-44`: "svg_id is
   `plot-{BLOCK}-{NN}` with the number zero-padded to two digits, **so lexical order is
   manifest order**", justifying `.order("svg_id")`. The same session's plan widened the
   contract to allow `plot-07`, which sorts before every `plot-A-…` — the plan's §3 pinned
   that consequence as accepted, but nothing was written at the code site that states the
   guarantee. **When a plan "pins an accepted consequence", grep for the comment that
   asserts the now-broken guarantee; accepted-in-the-plan is not recorded-in-the-code.**

7. 2026-08-21 (plan 16) — the *inverse*: the comment is **narrower than the code**.
   `tools/pipeline/pipeline/export/svg.py:84-86`: "A blockless and a lettered plot can share
   the same padded number -- the block prefix is what keeps their on-map labels
   distinguishable", above `f"{plot.block}-{int(plot.number)}" if plot.block else ...`, which
   prefixes **unconditionally**. In a single-block colony there is nothing to distinguish, yet
   every plot's visible map label changes (`1` → `A-1`). **A conditional-sounding rationale
   over unconditional code hides a user-visible change to existing colonies — check the
   comment's stated condition against the branch predicate actually written.**

8. 2026-08-31 (plan 22, public colony link) — a *security* rationale stretched to cover a case
   it does not apply to. `PublicColonyView.tsx:52-56`: "Wrong token, revoked/regenerated
   token, an unverified colony, **and a real fetch error** are all shown the same way on
   purpose … a distinguishable message would let a caller confirm a guessed uuid belongs to a
   real colony." The plan's pinned ambiguity constraint is about `get_public_colony`'s
   *response shape* (found true/false); a thrown network/PostgREST error reveals nothing about
   the token, so folding it in is not required by the constraint — it just tells an offline
   visitor their live link is revoked. **When a comment cites a pinned constraint to justify
   merging several conditions, check each condition against what the constraint actually
   pins.** See [[review-error-vs-empty-conflation]].

**How to apply:** for CSS especially, do the specificity/cascade arithmetic yourself rather
than accepting a comment's claim about which rule wins — `!important` scoped to one selector
says nothing about selectors it does not match. Related:
[[review-docs-vs-enforcement-drift]], [[review-attribution-fallbacks]].
