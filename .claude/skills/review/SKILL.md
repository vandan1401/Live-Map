---
name: review
description: Adversarial review of the current diff by a reviewer that did not write it. Tier 1 tasks.
context: fork
agent: adversarial-reviewer
background: false
---

<!-- WHY A FORK AND NOT /clear:
     The old move was to wipe context and re-read from disk so the reviewer had no memory
     of its own design reasoning. The isolation was real, but you paid a full context
     reload for it and had to copy findings back by hand.
     A forked subagent gets the same independence — its own window, judging the artifact
     rather than its own recent reasoning — while your main session keeps everything it
     had, and the findings come back into this conversation automatically. Same benefit,
     none of the reload. `background: false` makes it block so you get the result now. -->

Review the diff below. **You did not write this code.** Be sceptical.

## The diff
!`bash .claude/preamble.sh diff-head`

## Rules it must satisfy
!`bash .claude/preamble.sh invariants`

## The plan it is supposed to implement
!`bash .claude/preamble.sh plan-full`

## Check in this priority order

1. **Invariant violations** — float money, state written outside the state machine,
   database access outside the data layer, uniqueness enforced in app code instead of a
   constraint, `any`, business constants inline in a component.
2. **Implemented vs. plan on disk** — every requirement present; nothing outside scope
   changed. Judge against the written plan, not against what the code seems to intend.
3. **Failure modes** — partial writes, idempotency, concurrency, orphans, dead computation.
4. **Claims not backed by evidence** — anywhere the work asserts something works without
   a command and real output behind it.

## Output

Report **problems only**. No praise. No summary of what the code does. No style
preferences. Flag only gaps that affect correctness or a stated requirement — a reviewer
asked to find gaps will always find some, and chasing every one produces defensive
over-engineering. If you find nothing that meets that bar, say exactly that.

Per finding: file and line, which rule or plan item it breaks, and the smallest fix.
