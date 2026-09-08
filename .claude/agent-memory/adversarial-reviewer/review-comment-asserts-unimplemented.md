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

**9th recurrence, 2026-08-31 (plan 23, admin portal).** `admin-portal/server.ts`'s header
comment: "Every mutating route does require `Content-Type: application/json`, a cheap CSRF
mitigation." The check lives only inside `readJsonBody()`, and the two public-link routes
(`POST`/`DELETE /api/colonies/:id/public-link`, lines 147/156) take no body and never call it
— a cross-site simple-form POST reaches `regeneratePublicLink` unchecked. **When a security
comment says "every route", enumerate the routes: the guard that lives in a body parser only
covers routes that parse a body.**

**10th recurrence, 2026-09-01 (plan 25, dimensions on public link) — two in one diff, both
citing evidence that does not exist.** (a) `colonyModel.test.ts`'s `resolveClickedPlot`
header: "every fixture plot here has a real, not-necessarily-rectangular ring" — all 26
`class="plot"` paths in `fixtures/shree-vatika-2/colony.svg` are axis-aligned
`M… H… V… H… Z` rectangles (checked with a regex over the file), so the comment is what
excuses the missing bbox-vs-ring case. (b) `renderColonyPreview.ts`'s new comment cites
"(renderColonyPreview.test.ts…)" as the proof its `view`/`viewport` hoist is exercised under
jsdom — **no such file exists** in `apps/map/src/components/map/`. **When a comment names a
fixture property or a test file as its justification, verify the fixture (parse it, don't
eyeball it) and `ls` the file.**

**11th recurrence, 2026-09-08 (plan 28, backdrop) — a CSS comment describing behaviour in
*another* file that was never written.** `public-colony.css`'s `.public-colony-backdrop-
vignette` header: "usePublicColonyCanvas.ts fades this out entirely once zoomed onto the
plots (mapBackdropLabels.ts-adjacent zoom math, see that file)". `grep -rn vignette
apps/map/src` returns three hits, all static: the class rule, the unconditional `<div>` in
`PublicColonyView.tsx`, and one comment. No JS ever touches it. The same false claim was
then copied into `PROGRESS.md`'s `## Current` ("a screen-space edge vignette that fades out
once zoomed onto the plots") and contradicts the plan's own acceptance criterion (d).
**When a comment in file A says file B does something, grep file B — a cross-file claim is
the cheapest kind to write and the least likely to be checked.**

**12th recurrence, 2026-09-08 (plan 28, second pass) — the *removed* feature's vocabulary
survived in three places after the code was corrected.** The label zoom-fade was deliberately
deleted (plan §3 "No per-label reveal/fade threshold"), yet `public-colony.css:166` still says
"real place/road names fading in on zoom", `:169` still carries a dead `transition: opacity
200ms ease`, `:170-172` still explains why a "hidden (opacity: 0) label" needs
`pointer-events: none`, `useMapBackdrop.ts:19-20` cites "mapBackdrop.json's label reveal
offsets (PROGRESS.md Deferred)" — a field that does not exist in that JSON — and
`docs/plans/28.md:1`'s own title is still "zoom-reveal OSM labels". **When a review causes a
feature to be *removed* mid-build, grep the removed feature's nouns ("fade", "reveal",
"threshold", "offset") across css/ts/md — the code gets fixed, the prose describing it does
not, and the plan title is the last thing anyone edits.**

**13th recurrence, 2026-09-08 (plan 28, third pass) — the plan's *body* kept the removed
feature after its title was fixed.** `docs/plans/28.md:121` still specifies
`createBackdropLabelLayer(map, backdrop.data.labels, () => fitZoomRef.current)` and "call its
`.update()` inside the existing `onZoom` handler and once more inside `fit()`" — a 3-arg,
zoom-dependent signature that §2.7 and §3 of the *same document* explicitly delete and the
shipped `createBackdropLabelLayer(map, labels)` doesn't have. §2's "New files" list (7 items)
also never gained `useMapBackdrop.ts`, the file §3 then references three times. **After a
mid-build correction, re-read the plan §-by-§ against the shipped exports: the section that
*states* the correction gets edited, the section that *calls* the removed API does not.**

**14th recurrence, 2026-09-08 (plan 28, fourth pass) — a constant deleted mid-build still
named in three doc sites.** `BACKDROP_MIN_ZOOM` was replaced by a runtime derivation
(`applyBackdropMinZoom`), yet `NAVIGATION.md:263` still says the map mounts "at a lowered
`minZoom` (`BACKDROP_MIN_ZOOM`)", `PROGRESS.md:14` still credits
"`BACKDROP_FIT_PADDING`/`BACKDROP_MIN_ZOOM`", and `PROGRESS.md:2552`'s Deferred entry still
lists "`BACKDROP_MIN_ZOOM = -8`/`VIGNETTE_FADE_RANGE = 1.2`" — both values the same session
had already changed (to a derived value and `Math.log2(1.6)`). The same NAVIGATION row also
attributes `paddedColonyLatLngBounds` to `useMapBackdrop.ts` when it lives in `view.ts`.
**Rule: after any mid-build constant rename/deletion, `git grep` the OLD identifier across
`*.md` — the code sites get fixed by the compiler, the prose sites have no compiler. Cheap
and it lands every time on this project because PROGRESS.md and NAVIGATION.md are written
before the last correction.**

**15th recurrence, 2026-09-08 (plan 28, sixth pass) — a comment crediting a function with a
guarantee its own caller has to add.** `mapBackdropTransform.ts:42-44`: "useMapBackdrop.ts
uses this to derive how far a visitor can zoom out before running past the raster's own edge
onto bare grass." `backdropWorldBounds` returns the **circumscribed** box; the caller
(`useMapBackdrop.ts:65-74`, whose own comment correctly says the box is "wrong for what does
this cover") insets it by the rotation overhang first. Both comments are individually
defensible and together they mislead: the exported, reusable function advertises the
guarantee, the private caller supplies it. **Rule: when a fix is applied at the call site,
re-read the *exported* function's doc comment — it was written before the fix and still
promises the pre-fix behaviour to the next caller.**

**How to apply:** for CSS especially, do the specificity/cascade arithmetic yourself rather
than accepting a comment's claim about which rule wins — `!important` scoped to one selector
says nothing about selectors it does not match. Related:
[[review-docs-vs-enforcement-drift]], [[review-attribution-fallbacks]].
