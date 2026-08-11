---
name: wrap
description: Close out a unit of work — full gate, update state files, log, commit.
model: sonnet
effort: low
allowed-tools: Bash(make *) Bash(pnpm *) Bash(pytest *) Bash(git add *) Bash(git commit *) Bash(git status *) Bash(git diff *)
---

## What changed
!`bash .claude/preamble.sh wrap-status`

## Your task, in this order. Do not skip a step or reorder.

1. **Run the full gate** — typecheck + lint + full test suite + a production build. Not
   the fast gate. The production build is the step that catches what the rest misses.
   If it fails, stop here and report. Never end a unit of work on a broken build.

2. **Update `PROGRESS.md`**
   - Rewrite `## Current` in place to reflect the new state and the next action.
   - Append one `## Log` entry: Done / Next / Surprises / Verified. Four lines. Terse.
     Surprises carries what the plan could not have predicted — it is the field a cold
     session most needs and the one most often left empty. If nothing surprised you,
     write "none", but check first.
   - Move any gap you found but did not fix into `## Deferred`.

3. **Update `NAVIGATION.md`** if you added a module, route, table, or a function others
   should reuse. An un-indexed function gets re-implemented by the next session.

4. **Log any decision** made this session that is not yet recorded: one row in
   `DECISIONS.md`, and a full file at `docs/decisions/D-NNN-<slug>.md` including the
   rejected alternatives. Never edit a past row — supersede it and point back.

5. **Promote a command to a named script only if all three hold:** it is longer than one
   line or has arguments that are easy to get wrong; it will be needed in a *future*
   session, not just repeatedly in this one; and it gets a conventional name
   (a root Makefile target) so it is found by name, never by searching.
   Most commands fail this test — leave them inline. Anything that fits a lifecycle event
   becomes a hook instead, which costs nothing and needs no discovery at all.

6. **Commit** with a message naming the unit of work and the tier.

Report in the fixed format from CLAUDE.md.
