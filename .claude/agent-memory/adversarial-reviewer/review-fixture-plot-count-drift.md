---
name: review-fixture-plot-count-drift
description: The shared fixture's plot count (was 45, now 26) is hardcoded in ~8 spec/README/NAVIGATION files and in a unit test — any diff changing the fixture must be grepped for the old count, because nothing enforces the link.
metadata:
  type: feedback
---

`fixtures/shree-vatika-2/` is deliberately one copy shared by both halves, and its plot
count is written as a literal in prose that no test reads. On any diff touching
`fixtures/shree-vatika-2/colony.json`, grep the whole repo for the *old* count and for
`demo-plan` before concluding.

**Why:** 2026-08-14 (plan 05) the fixture was rewritten from 45 hand-authored plots to 26
plots hand-traced from a phone photo of a real, different site plan. `ColonyMap.test.tsx`
was updated 45 → 26; nothing else was. Left asserting 45 or naming `demo-plan.pdf` as the
producer: `spec/00-rules.md:110`, `spec/02-map-schema.md:39`, `spec/10-pipe-vector.md:30`,
`spec/11-pipe-geometry.md:31`, `spec/12-pipe-matching.md:40`, `spec/13-pipe-derive.md:33`,
`README.md:49-51`, `NAVIGATION.md:123`.

The deeper problem is not the stale number. CLAUDE.md's working-style rule says "the app
renders it, the pipeline's golden test must reproduce it. One copy, deliberately — two
would drift." A fixture traced by hand from a photo **cannot** be reproduced by any run of
`fixtures/demo-plan.pdf`, so the golden test that six unbuilt pipeline milestones (M9–M14)
are specified against has no achievable target. The plan's §4 wrote `tools/pipeline` off as
"unrelated to this task" — that unwritten assumption *was* the finding.

**2nd shape, 2026-09-13 (plan 32) — the doc's worked example *is* the fixture's own config
file.** `docs/cad-layer-standard.md`'s "Colony config" JSON block is
`tools/pipeline/colonies/shree-vatika-2.json` verbatim (same `id`, `name`,
`expected_plots: 26`, same `source`), and the diff added a `backdrop` block to that example
— while D-123 and plan 32 §2 H explicitly require the real `shree-vatika-2.json` **not** to
declare one, because the golden fixture export must stay byte-identical. The doc the owner
follows in AutoCAD now instructs them to edit the one config where the edit changes shared
fixture output. **Rule: when a doc's example config/manifest carries the fixture colony's
own id, any field added to the example is an instruction to change the fixture — check the
real file and the plan's own "fixture must stay unchanged" clause against each other.**
*CLOSED 2026-09-13, next pass: the example was swapped to `bharatkshetra`'s real config
(verified field-by-field against `tools/pipeline/colonies/bharatkshetra.json`) plus an
explicit "Never add a `backdrop` key to `tools/pipeline/colonies/shree-vatika-2.json`
itself". Note `contract/SPEC.md`'s `colony.json` example still carries `"id":
"shree-vatika-2"` and also gained a `backdrop` block — **not** the same hazard, because that
example already diverges from the real fixture in `viewbox` (720 vs 1390), `select_zoom`
(fixture has none) and `source.file` ("..."), so it reads as illustrative. Check that
divergence before flagging it.*

**How to apply:** treat "which repo-wide claims does this fixture underwrite?" as a
standing question, the same way [[review-fixture-geometry-unchecked]] treats "which derived
values could have been typed by hand?". `grep -rn "45 plot\|demo-plan" --include=*.md .`
is the one command. Related: [[review-docs-vs-enforcement-drift]].
