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

**Sub-pattern seen twice now — the false "same way X already works" analogy.** New docs
justify a mechanism by claiming an existing field already works that way, and it doesn't.
2026-09-13 (plan 32): `contract/SPEC.md`, `contract/colony.schema.json`'s `description`,
`extract/types.py` and `PROGRESS.md` all said the new `colony.backdrop` block is carried
from `tools/pipeline/colonies/<id>.json` into the manifest "the same way `select_zoom` is" —
but `select_zoom` is derived in `build_manifest()` from the DXF's `COL-ZOOM-REF` ring and
never appears in a colony config, which `SPEC.md` itself states 14 lines earlier. The
analogy is the part to verify: it is written from memory, not from the code.

**Sub-pattern — "this example is `<file>`'s own real config", not diffed against the real
file.** 2026-09-13 (plan 32, review pass): `docs/cad-layer-standard.md`'s worked config
block was rewritten from `shree-vatika-2` to `bharatkshetra` to close an earlier finding,
labelled "bharatkshetra's own real config (with an illustrative `backdrop` block added)" —
but it silently dropped `"default_block": null`, which the real
`tools/pipeline/colonies/bharatkshetra.json` sets explicitly. `load_colony_config`
(`extract/dxf.py:42`) defaults an absent key to `blocks[0]`, so copying the example turns
blockless bare labels into `plot-E-01`: a plot-identity change, in the Tier-1 doc the CAD
operator follows. **When a doc claims an example IS a real file, `diff` it against that
file key-by-key — and remember a review-driven doc rewrite is written from the same memory
that produced the original error.**

**How to apply:** when a comment states a behaviour, find the branch that implements it;
when a doc cites a function, path or prior decision, `git grep` it at HEAD before accepting
the reasoning built on it. When a doc says "mirrors / the same way / the exact pattern of
<existing field>", open the existing field's producer and confirm the mechanism actually
matches. A doc instruction that cannot be followed (e.g. "delete X in the same commit"
where X does not exist) is a finding, because it is aimed at a future Tier 1 unit.

Related: [[review-unit-space-conversions]]
