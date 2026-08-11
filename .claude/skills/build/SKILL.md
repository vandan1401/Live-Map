---
name: build
description: Implement one approved plan. Does not plan, does not review.
argument-hint: [plan number]
disable-model-invocation: true
model: sonnet
effort: medium
---

## The approved plan
!`bash .claude/preamble.sh plan-n $0`

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

Report in the fixed format from CLAUDE.md. Nothing after it.
