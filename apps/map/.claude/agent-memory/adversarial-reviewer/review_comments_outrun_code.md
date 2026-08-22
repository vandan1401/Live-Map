---
name: review-comments-outrun-code
description: Recurring defect class in this repo — comments, PROGRESS.md entries and plan sections that assert behaviour or prior art the code does not have
metadata:
  type: project
---

In this codebase comments carry unusual weight (they record owner asks and past live bugs),
and that makes them a load-bearing place for errors. Verify assertions instead of reading
them as context.

**Why:** in the 2026-08-22 canvas review, three separate claims were false:
`drawLabels.ts`'s comment said the selected plot's label stays visible while zoomed out
(the guard above it prevents that); `colonyTheme.ts` said the stroke is "0.5 user units"
while `drawColony.ts` divides it by the zoom scale; and `PROGRESS.md` plus `docs/plans/18.md`
cite a `stripTrees()` in `parseColonySvg.ts` that never existed in any commit
(`git grep stripTrees HEAD` was empty) — which also disguised a *new* behaviour (trees no
longer render at all) as pre-existing.

**How to apply:** when a comment states a behaviour, find the branch that implements it;
when a doc cites a function, path or prior decision, `git grep` it at HEAD before accepting
the reasoning built on it. A doc instruction that cannot be followed (e.g. "delete X in the
same commit" where X does not exist) is a finding, because it is aimed at a future Tier 1
unit.

Related: [[review-unit-space-conversions]]
