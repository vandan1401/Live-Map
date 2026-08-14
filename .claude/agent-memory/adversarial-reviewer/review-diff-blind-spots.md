---
name: review-diff-blind-spots
description: The diff handed to /review comes from `git diff HEAD` — it omits untracked files and sweeps in unplanned work; check `git status --short` and the plan's task list before concluding.
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

The same mechanism cuts the other way: `git diff HEAD` also sweeps in work the plan never
mentioned, because `/build` never stages and nothing separates one task's edits from
another's. 2026-08-15 (plan 08) the diff carried two *other* deferred owner-feedback items
(map→picker back button, branded picker heading) that appear nowhere in `docs/plans/08.md`
§2 — and the only correctness bug in the diff was in that unplanned half.

**How to apply:** every review, first tool call. If untracked files exist and are in scope
for the plan, read them directly rather than reviewing only what the diff showed, and say
in the report that the supplied diff was incomplete. Conversely, diff every changed file
against the plan's §2 task list and flag files the plan does not name — CLAUDE.md's working
style is "note, don't fix; gaps outside the plan go to `PROGRESS.md` → `## Deferred`", and
unplanned edits ride in unreviewed by tier. Related: [[project-autonomous-loop]].
