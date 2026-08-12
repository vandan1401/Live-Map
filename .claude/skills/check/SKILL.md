---
name: check
description: Verify the current work against its acceptance criteria. Diagnoses only, fixes nothing.
model: sonnet
effort: medium
allowed-tools: Bash(make *) Bash(pnpm *) Bash(pytest *) Bash(git diff *)
---

## Acceptance criteria from the plan
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" plan-acceptance`

## What changed
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" diff-stat`

## Your task

Produce a PASS/FAIL table, one row per acceptance criterion:

| # | Criterion | PASS/FAIL | The one command or observation that proves it |
|---|---|---|---|

Rules:

- Every row cites the specific command run and its **real output**. Not "tests pass" —
  the actual line. If nothing was run for a row, the proof column reads `not run`.
- **Fix nothing yet.** Diagnosis and remediation are two passes on purpose, so a fix does
  not get made under the same unverified assumption that produced the bug.
- If this task writes state, add a second table for the failure-mode checklist in
  `spec/00-rules.md`, same format. Concurrency rows must cite an actual concurrent test,
  not the existence of a unique constraint.
- Anything the type system cannot see — code inside template literals, DB policies and
  grants, deployed config — must be proved by executing the real thing, not by a passing
  typecheck. Say so explicitly in the proof column.

End with one line: what is genuinely done, and what is not.
