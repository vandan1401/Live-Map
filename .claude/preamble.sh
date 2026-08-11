#!/bin/bash
# Preamble helper for the skills in .claude/skills/.
#
# WHY THIS EXISTS: skills inline shell output via !`...` blocks so a session starts
# with state already loaded at zero tool-call cost. But Claude Code's permission
# checker refuses compound shell (||, |, ;) inside those blocks. Rather than
# approving arbitrary shell, every skill calls this one script with a subcommand,
# so a single allow-list entry covers all of them.
#
# Read-only. Never mutates anything. Always exits 0 so a missing file degrades to a
# helpful message instead of breaking the preamble.

set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true
SUB="${1:-}"
ARG="${2:-}"

latest_plan() { ls -1 docs/plans/*.md 2>/dev/null | tail -1; }

case "$SUB" in

  progress)
    if [ -f PROGRESS.md ]; then cat PROGRESS.md; else
      echo "MISSING — this is a fresh project."; fi ;;

  current)
    sed -n '/## Current/,/## Deferred/p' PROGRESS.md 2>/dev/null ;;

  git)
    git status --short 2>/dev/null | head -30
    echo "---"
    git log --oneline -5 2>/dev/null ;;

  commands)
    if [ -f Makefile ]; then
      echo "== Makefile targets =="
      grep -E '^[a-zA-Z_-]+:' Makefile 2>/dev/null | head -25
    fi
    if [ -f apps/map/package.json ]; then
      echo "== apps/map scripts =="
      (cd apps/map && npm pkg get scripts 2>/dev/null | head -25)
    fi
    if [ ! -f Makefile ] && [ ! -f apps/map/package.json ]; then
      echo "none defined — M1 creates them"
    fi ;;

  decisions)
    head -60 DECISIONS.md 2>/dev/null ;;

  plan-latest)
    P=$(latest_plan)
    if [ -n "$P" ]; then echo "== $P =="; cat "$P"; else
      echo "No plan on disk."; fi ;;

  plan-full)
    P=$(latest_plan)
    if [ -n "$P" ]; then cat "$P"; else
      echo "No plan — review against the invariants only."; fi ;;

  plan-acceptance)
    P=$(latest_plan)
    if [ -n "$P" ]; then sed -n '/Acceptance/,/Failure modes/p' "$P"; else
      echo "No plan on disk — check against my stated requirement instead."; fi ;;

  plan-n)
    if [ -f "docs/plans/$ARG.md" ]; then cat "docs/plans/$ARG.md"; else
      echo "NO PLAN FOUND for '$ARG'. If this is a Tier 2 or 3 task that needs no plan,"
      echo "proceed from my instruction. If it is Tier 1, stop and tell me to run /plan first."
    fi ;;

  diff-stat)
    git diff --stat 2>/dev/null ;;

  diff-head)
    git diff HEAD 2>/dev/null ;;

  wrap-status)
    git diff --stat HEAD 2>/dev/null
    echo "---"
    git status --short 2>/dev/null ;;

  invariants)
    sed -n '/## Invariants/,/## Risk tiers/p' CLAUDE.md 2>/dev/null ;;

  *)
    echo "unknown subcommand: '$SUB'" ;;
esac
exit 0
