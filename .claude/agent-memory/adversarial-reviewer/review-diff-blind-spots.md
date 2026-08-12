---
name: review-diff-blind-spots
description: The diff handed to /review comes from `git diff HEAD` and omits untracked files — always check `git status --short` before concluding a review.
metadata:
  type: feedback
---

Before concluding any `/review`, run `git status --short` and compare against the diff
supplied in the prompt. Anything untracked is missing from what I was shown.

**Why:** `/review` inlines `.claude/preamble.sh diff-head`, which is `git diff HEAD`. That
excludes untracked files entirely, and only `/wrap` has `git add` in its allowed-tools —
`/build` never stages. On a greenfield milestone (M2 created ~7 new files), that means most
of the work under review is invisible. Concluding "nothing above the bar" from a partial
diff is the worst failure mode available to this role.

**How to apply:** every review, first tool call. If untracked files exist and are in scope
for the plan, read them directly rather than reviewing only what the diff showed, and say
in the report that the supplied diff was incomplete. Related: [[project-autonomous-loop]].
