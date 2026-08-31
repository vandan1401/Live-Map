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

**2026-08-20 (plan 12, M11), both halves at once and worse.** The diff changed
`docs/cad-layer-standard.md` — a file plan 12 §4 names verbatim as a non-goal ("No changes
to `docs/cad-layer-standard.md` or `contract/`") and CLAUDE.md's risk table rates **Tier 1**.
Meanwhile `git status --short` showed **ten untracked `tools/cad-lisp/*.py` files, 1,315
lines**, three of which the tracked README change documents by name. **Rule: an explicit
§4 non-goal appearing in the diff is a finding on its own, no further analysis needed** —
and when a tracked doc names a file, check `git ls-files` for it, not just the filesystem.

**4th, 2026-08-20 (plan 13, M12).** The same `tools/cad-lisp` block is *still* riding along —
now 11 `.py` files + `README.md` + `cv-tools.lsp`, ~1,450 lines, in a diff whose plan (13)
never mentions the directory. It has now crossed two consecutive Tier 1 milestone commits
without ever being the subject of a plan or a review. **Rule: if the same unplanned block
appears in two reviews running, say so explicitly and recommend it be committed separately
before it fuses to a Tier 1 commit** — and spot-check it anyway (this pass found a dead local
in `fill_missing_labels.py` that no linter covers, since `ruff` only runs under
`tools/pipeline/`).

**5th, 2026-08-29 (plan 20, Tier 1 contract change).** Two unplanned blocks again, and this
time one of them made the gate red. `tools/pipeline/ui/**` (Flask server + static page,
~460 lines, staged this time) and a `$INSUNITS`/`$MEASUREMENT` fix across five
`tools/cad-lisp/*.py` files — neither in `docs/plans/20.md` §2. `ruff check .` covers the
whole `tools/pipeline` tree, so `ui/server.py`'s `PLW1510` broke `make verify-pipe`/`make
gate` for the *planned* half. `PROGRESS.md` had already recorded "verify not re-run since
`ui/` was added" and the wrap claimed "ruff clean on every touched file" — true only because
`ui/` was scoped out of "touched". **Rule: when a diff adds a new directory under a linted
root, run that root's lint yourself before believing any "clean" claim, and check whether a
new dependency landed in `[project] dependencies` vs `[project.optional-dependencies]`
(`flask>=3.0` went into the required list of an offline CAD pipeline).**

**How to apply:** every review, first tool call. If untracked files exist and are in scope
for the plan, read them directly rather than reviewing only what the diff showed, and say
in the report that the supplied diff was incomplete. Conversely, diff every changed file
against the plan's §2 task list and flag files the plan does not name — CLAUDE.md's working
style is "note, don't fix; gaps outside the plan go to `PROGRESS.md` → `## Deferred`", and
unplanned edits ride in unreviewed by tier. Related: [[project-autonomous-loop]].
