---
name: project-autonomous-loop
description: User is deliberately removing human approval gates from the /start -> /plan -> /build -> /review skill chain so Claude drives a full session unattended.
metadata:
  type: project
---

The user is intentionally converting the skill chain (`/start` -> `/plan` -> `/build` ->
`/review`) into an unattended loop: approval pauses removed from `start`, `plan`, and
`build` SKILL.md; `disable-model-invocation: true` stripped from every skill; the
`Edit(migrations/**)` deny rule removed from `.claude/settings.json`. All on explicit user
request (recorded in `PROGRESS.md` M2 log).

**Why:** the user does not want to retype each command to advance a session. This is a
deliberate trade, not an oversight.

**How to apply:** do NOT flag "removing the approval gate is unsafe" as a finding in
principle — that is the user's decided position. DO flag concrete consequences the change
leaves inconsistent: docs that still describe the old gate (`README.md`), per-tier process
requirements the new branching silently drops (`.claude/rules/tier-*.md`), and safety
claims the new text asserts but nothing implements. Related: [[review-diff-blind-spots]].
