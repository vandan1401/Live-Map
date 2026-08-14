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

**How to apply:** treat "which repo-wide claims does this fixture underwrite?" as a
standing question, the same way [[review-fixture-geometry-unchecked]] treats "which derived
values could have been typed by hand?". `grep -rn "45 plot\|demo-plan" --include=*.md .`
is the one command. Related: [[review-docs-vs-enforcement-drift]].
