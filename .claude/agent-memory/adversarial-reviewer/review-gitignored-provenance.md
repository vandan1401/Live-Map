---
name: review-gitignored-provenance
description: Shipped source comments, plans and decisions cite experiments/ and tools/pipeline/out/ as their source of truth — both are gitignored, so every such citation is unverifiable and any asset that only exists there is one git clean from gone
metadata:
  type: feedback
---

`git check-ignore -v` every path a shipped comment, plan or decision cites as its source of
truth. This repo gitignores `/experiments/` (`.gitignore:53`) and `tools/pipeline/out/`
(`.gitignore:26`), and both are cited constantly as authoritative.

**Why:** 2026-09-08, plan 28 (Bharatkshetra backdrop). Eight or so comments across
`mapBackdropTransform.ts`, `useMapBackdrop.ts`, `drawBackdrop.ts`,
`mapBackdropTransform.test.ts`, `docs/plans/28.md` and `docs/decisions/D-036-*.md` cite
`experiments/map-texture-poc/{bharatkshetra_transform_v2.json, zoom_labels_demo.html,
bake_static.html, stitch.html, anchor_transform.py, backdrop_duotone_v2.png}` — none of
which are in the repo. The pinned *values* did survive (checked into
`apps/map/src/config/mapBackdrop.json` plus the committed JPEG), so the runtime is
self-contained; what did not survive is (a) any way for a later session to check a number
against its stated source, and (b) the AI-generated 1440x960 source PNG itself, of which
the repo now holds only a lossy 431 KB JPEG re-encode. Plan §2.1's "the transform is pinned
to the pixel grid, not the encoding, so this is a free change" is only true while that PNG
exists.

**Partly fixed, same plan, next pass (2026-09-08):** `backdrop_duotone_v2.png` (full 2.28 MB
PNG) and `bharatkshetra_transform_v2.json` are now committed at `docs/decisions/D-036-assets/`,
and D-036 gained a "Durable asset copy" note calling that the source of truth. **The note
overstates what was copied.** Still gitignored and still cited as authoritative: (a)
`zoom_labels_demo.html`, which `useMapBackdrop.ts:20-24` names as the authority for
`VIGNETTE_FADE_RANGE = Math.log2(1.6)` and `mapBackdropTransform.test.ts:37` names as the
source of the pinned label raster pixels; (b) `osm_labels_raw.json`, which
`docs/plans/28.md` §3 cites as the confirmation that the highway's real OSM tag is
`ref=MD2512` — i.e. the evidence behind an ODbL credit. **Rule: when a diff creates a
"durable copy" directory, diff the files it copied against the files the shipped comments
actually cite; a partial rescue reads as a complete one.** Related:
[[review-attribution-fallbacks]], [[review-unpinned-constants]].

Same trap in the other direction: `tools/pipeline/out/<colony>/colony.svg` is gitignored,
so a real colony's viewBox (Bharatkshetra's is `0 0 1000 1399.73`) cannot be read from a
fresh clone — but it is exactly the number camera/fit maths gets checked against. Note that
`fixtures/shree-vatika-2/` (1000 x 1390) is *deliberately* tracked and is nearly identical,
which makes a copied-from-the-fixture number look right.

**How to apply:** cheap, run it early — collect every path mentioned in the diff's comments
and pipe through `git check-ignore -v`. A hit is not automatically a finding: ask whether
the *values* were checked in too. It is a finding when the cited artifact is irreplaceable
(a generated image, a paid API result) or when a comment says "do not re-derive, see X" and
X is unreachable. Related: [[review-docs-vs-enforcement-drift]],
[[review-comment-asserts-unimplemented]], [[review-diff-blind-spots]].
