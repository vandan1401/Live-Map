---
name: review-line-cap-breaches
description: Invariant 7's 250-line cap gets breached by growth in files that were already near or over it — the filesize.sh hook is PostToolUse (advisory feedback, cannot undo the write), so a breach reaches the diff. Run wc -l on every touched file.
metadata:
  type: feedback
---

Check `wc -l` on every file a diff touches, and compare against `git show HEAD:<file> | wc -l`
to see whether *this* diff crossed 250.

**Why:** `.claude/hooks/filesize.sh` is a **PostToolUse** hook — its own header says
"PostToolUse cannot undo the write, so it feeds the problem back for Claude to fix." A
`{"decision":"block"}` there is a message, not a prevention; it can be (and has been)
carried past. It also only checks `*.ts|*.tsx|*.js|*.jsx|*.py` — see
[[review-docs-vs-enforcement-drift]] item 4 for the `.css` blind spot.

**How to apply:** the repo's `tools/pipeline/tests/*.py` files sit right at the boundary and
are the usual offenders, because "add a test per plan item" grows them a few lines at a time:

- 2026-08-14 (M6): `apps/map/src/styles/colony-theme.css` 179 → 263 (unchecked extension).
- 2026-08-21 (plan 15): `tools/pipeline/tests/test_dxf.py` 237 → **267**. Same diff grew
  `test_matching.py` 263 → 298 and `test_export.py` 303 → 304, both already over — the hook's
  own wording is "do not grow it further", so a pre-existing breach is not a licence.

Smallest fix is almost always a new sibling test module (`test_colony_config.py`), not
deleting coverage. **Confirmed working** — the plan 15 re-review found the sibling-module fix
applied (`test_colony_config.py`, `test_matching_blockless.py`, each with a docstring naming
the cap as the reason for the split), `test_dxf.py` back to 238, and the cross-module
`from test_matching import _config, _label, _square_ring` collecting fine under the repo's
pytest config. Recommend this fix without hedging.

- 2026-08-24 (plan 19): **not a test file this time** — `apps/map/src/components/map/
  drawColony.ts` 242 → **278**, blown past by ~36 lines of which most are explanatory
  comments for a 6-line paint fix. `make gate` does **not** check file length (only the
  PostToolUse hook does), so "gate full green" in `PROGRESS.md` is not evidence for
  invariant 7. Smallest fix there: `fillDecor`/`fillGarden`/`amenityFillFor` (~50 lines) into
  a sibling `drawDecor.ts`, exactly the split `drawLabels.ts`/`drawDimensions.ts` already are.

- 2026-08-29 (plan 20): `test_dxf.py` **238 → 315** (the sibling-module fix from plan 15 has
  now been fully undone by five new `COL-ZOOM-REF` cases), and `test_export.py` **318 → 379**
  in the same diff. Both crossed/extended in a diff whose `PROGRESS.md` reports "ruff/mypy
  clean" — again, `make gate` never measures length.

- 2026-08-31 (plan 22): `apps/map/src/App.tsx` **242 → 253** — over the cap for the sake of an
  8-line early-return branch, 4 lines of which are comment. Also confirmed from the config
  side this time: `apps/map/.oxlintrc.json` enables only `react/rules-of-hooks` and
  `react/only-export-components` — there is no `max-lines` rule, so `pnpm lint` in `make gate`
  cannot see length. App.tsx is now the file to watch: every new top-level route/branch lands
  in it.

- 2026-09-03 (plan 27): `apps/map/src/components/map/useColonyCanvas.ts` **257 → 264** — already
  over at HEAD, grown a further 7 by two imports + a 4-line config resolution. The plan's own
  §5 said "every touched/new file stays under 250 lines" and singled out `drawDimensions.ts`
  (fine, 150) while never rechecking the two canvas hooks it also edited. `usePublicColonyCanvas.ts`
  228 → 238 in the same diff is now 12 from the cap. **These two hooks are the new files to
  watch: every per-colony feature threads through both mount effects.**
  *Re-checked 2026-09-03 after the fix: 247 and 229 — brought under by extracting
  `loadGrass.ts` and `countOrphanStatuses`, i.e. the cap was paid for with unplanned
  refactors inside a Tier 2/3 plan. Expect that trade next time and check the refactor is
  behaviour-identical and recorded in PROGRESS.md.*

Note the residual: `test_export.py` (304) and `test_matching.py` (264) are *already* over the
cap and every plan that adds a `ColonyConfig` field grows them by a line. Not worth flagging
per-diff; worth flagging when a diff adds a whole test to one of them.
Related: [[review-vacuous-acceptance-tests]].
