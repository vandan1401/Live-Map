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
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" progress`

### Git
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" git`

### Available commands (use these by name — never search for a script)
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" commands`

### Open plan, if any
!`bash "C:/Users/moont/live projects/Colony Viewer/.claude/preamble.sh" plan-latest`

## Your task

1. From the state above, state in **two lines** where the project stands and what the
   next action is. Do not summarise the whole log.
2. State the risk tier of that next action (see CLAUDE.md) and why.
3. If a plan file exists, check whether its last line is `**Status:** complete` (`/wrap`
   appends this when a plan's work is fully done). No marker means unfinished — say so,
   work is already under way.
4. If `NAVIGATION.md` has an entry for the area you are about to touch, name the files
   you expect to change. If it has no entry, say so — that is a gap to fix in `/wrap`.

Then proceed immediately — no approval gate, no waiting for a command to be typed:

- **Tier 1, no plan on disk, or the latest plan is marked complete:** invoke `/plan` for
  the next action, then `/build` against the result, then `/review` against the diff.
  Launch each the moment the previous one finishes; do not pause between them.
- **Tier 1, unfinished plan already on disk (no `Status: complete` marker):** invoke
  `/build` against it directly, then `/review`.
- **Tier 2:** no `/plan` or `/review` — implement directly, then run `/check` before
  stopping. If the task turns out to write plot state, stop: it is Tier 1, restart at the
  Tier 1 branch above.
- **Tier 3:** implement directly, then the test gate (`make verify-map` /
  `make verify-pipe`).

In the Tier 1 branches, stop once `/review` returns. Report its findings verbatim and
wait — do not invoke `/wrap` on your own initiative.

$ARGUMENTS
