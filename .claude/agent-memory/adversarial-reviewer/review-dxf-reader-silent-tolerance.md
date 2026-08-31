---
name: review-dxf-reader-silent-tolerance
description: The DXF reader is required to be strict (tier-1.md "never repair, never guess, never fall back"), but new layer readers keep accepting a geometry variant they then silently mis-measure — probe the reader with the bad input yourself.
metadata:
  type: feedback
---

When a diff adds or widens a `COL-*` layer reader in
`tools/pipeline/pipeline/extract/dxf.py`, construct the *non-conforming* drawing yourself in
a scratch ezdxf script and print what the reader returns. Do not reason about it from the
plan's assumptions section.

**Why:** `.claude/rules/tier-1.md` — "The reader is **strict**: refuse non-conforming input
naming the offending layer and entity handle. Never repair, never guess, never fall back."
Every accepted-but-wrong value here becomes a number in `colony.json` that nothing
downstream can question.

- 2026-08-29 (plan 20), `COL-ZOOM-REF`. The plan pinned "the rectangle must be drawn
  axis-aligned" as a *requirement* and forbade rotation-correcting logic — but nothing
  enforced axis-alignment, and the mid-build addendum made a block `INSERT` (which carries
  a `rotation` DXF attribute AutoCAD prompts for) the recommended authoring path.
  `virtual_entities()` applies the rotation and `ring_extent_px` takes the axis-aligned
  bbox. A 9x16 block at rotation 45 returned `(17.68, 17.68)` instead of `(9.0, 16.0)` —
  ~2x wrong and the owner's chosen aspect ratio destroyed, with no error. The export QA
  band only catches "bigger than the whole site", so it passes.

**How to apply:** the probe is ~10 lines and settles it:
`.venv/Scripts/python.exe -c "import ezdxf; ...; from pipeline.extract.dxf import _read_<x>;
print(_read_<x>(ins).points)"`. Check the three variants the DXF format makes reachable for
free: rotated INSERT, non-uniform scale, nested block. A plan sentence saying "assumes X"
with no `raise` behind it is the finding.
Related: [[review-docs-vs-enforcement-drift]], [[review-vacuous-acceptance-tests]].
