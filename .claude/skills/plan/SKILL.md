---
name: plan
description: Produce an approved, durable implementation brief for one unit of work. Tier 1 tasks only.
argument-hint: [task name]
disable-model-invocation: true
model: opus
effort: high
---

<!-- Model routing lives HERE, in frontmatter — not in a subagent. You get the expensive
     model exactly for the reasoning step and nothing else, at zero spawn cost, in the
     same warm conversation. This is the cheap version of "Opus plans, Sonnet executes". -->

## Current state
!`bash .claude/preamble.sh current`

## Relevant decisions
!`bash .claude/preamble.sh decisions`

## Your task

Plan **$ARGUMENTS**. Read only what you actually need: use `NAVIGATION.md` to find files,
and read the narrowest slice that answers the question. Do not read whole files to
understand one function. Do not read files unrelated to this task.

Then write the brief to `docs/plans/<NN>.md` with exactly these six sections. A missing
section is *why* the build goes wrong later, not bad luck.

1. **Context already true** — what exists, what is already decided (cite decision IDs),
   what must not be reverted, and which existing functions to reuse **by exact path**.
2. **The exact task** — with file paths. Never "fix the tests"; name which tests and why.
   If a command currently fails, paste the real error output, not a paraphrase.
3. **Pinned constraints** — every irreversible or high-blast-radius call already made:
   interfaces, schema semantics, security boundaries, function shapes. Pin **every number
   that encodes a business trade-off** — a threshold, a window, a percentage. A number
   left unpinned gets guessed, and a guess that is plausible in isolation is still wrong
   once it meets a constraint the guesser could not see.
4. **Non-goals** — named, out of scope, so the build does not wander into adjacent files.
5. **Acceptance criteria** — the exact commands that must pass, plus the current test
   count, so a claimed delta can be checked at a glance instead of taken on faith.
6. **Failure modes** — if this task writes state, walk `spec/00-rules.md`'s checklist by
   name and say what each one means here. If it does not write state, write "N/A — no
   state writes".

**What to pin vs. leave open:** pin anything with blast radius and pin the acceptance
tests. Leave naming, internal structure, and implementation detail open. Specifying line
by line wastes the planning; under-specifying the load-bearing calls costs the session.

Present the plan and **stop for my approval before writing it to disk.**
