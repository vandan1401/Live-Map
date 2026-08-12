---
name: build
description: Implement one plan on disk. Does not plan, does not review.
model: sonnet
effort: medium
allowed-tools: Bash(git add *)
---

## The plan on disk
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" plan-latest`

## Your task

Implement the plan above, and nothing else.

- Anything in `apps/map/src/shared/` or `tools/pipeline/pipeline/geom/` gets its test written
  **first**. Those layers are pure, cheap to
  test, most reused, and most damaging to get wrong. This is not blanket TDD — only there.
- One coherent, independently verifiable unit at a time. Verify each before starting the
  next. A large diff that fails costs more to debug than several small ones that do not.
- Search for an existing function before writing a new one. Check `NAVIGATION.md` first.
- Verify with the command in CLAUDE.md. **Do not read code back to verify.**
- Do not start the next unit of work. Do not fix things outside the plan — note them in
  PROGRESS.md under Deferred and mention them.

Run `git add -AN` (intent-to-add) so new files show up in `git diff HEAD` — `/review`'s
diff is HEAD-relative and untracked files are otherwise invisible to it. Then report in
the fixed format from CLAUDE.md, then immediately invoke `/review` against the diff — no
approval gate here, `/review` is the checkpoint.
