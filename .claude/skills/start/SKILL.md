---
name: start
description: Recover project state at the beginning of a session and propose the next action.
allowed-tools: Bash(git status *) Bash(git log *) Bash(git diff *)
model: inherit
effort: medium
---

<!-- Everything between the backtick-bang markers below is executed BEFORE you see this
     file. The output is already inlined. This costs zero tool calls and zero round trips
     — it is the single biggest per-session saving in this template. Do not re-read these. -->

## State (already loaded — do not read these files again)

### PROGRESS.md
!`bash .claude/preamble.sh progress`

### Git
!`bash .claude/preamble.sh git`

### Available commands (use these by name — never search for a script)
!`bash .claude/preamble.sh commands`

### Open plan, if any
!`bash .claude/preamble.sh plan-latest`

## Your task

1. From the state above, state in **two lines** where the project stands and what the
   next action is. Do not summarise the whole log.
2. State the risk tier of that next action (see CLAUDE.md) and why.
3. If a plan file exists and its work is unfinished, say so — work is already under way,
   do not re-plan from scratch.
4. If `NAVIGATION.md` has an entry for the area you are about to touch, name the files
   you expect to change. If it has no entry, say so — that is a gap to fix in `/wrap`.

Then **stop and wait for my approval.** Write no code in this turn.

$ARGUMENTS
