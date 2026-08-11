# M14 — Export and the automatic QA gate

**Tier 1** (`tools/pipeline/pipeline/export/`). This module owns the contract with `colony-map`.

## Goal

Write `colony.svg` and `colony.json` that the app can consume, and refuse to write
anything that would break it.

## Build

- **Normalise** — translate so min x,y is zero, **flip Y** (CAD counts up, SVG counts
  down), scale to viewBox width 1000. Store the transform so real-world coordinates can be
  recovered later. Forgetting the flip renders the whole plan mirrored, and mirrored looks
  plausible, which is why this gets its own test (D-110).
- **Emit SVG** per the contract in `spec/00-rules.md`. Zero styling attributes. `<use>`
  elements carry explicit `width` and `height`.
- Embed a minimal fallback `<style>` block **inside** the file so it is viewable
  standalone during QA. The app's stylesheet overrides it. Without this, an unstyled SVG
  opens as solid black shapes, which is disorienting when checking a new colony.
- **Emit manifest** including `source` provenance (D-116) and `"verified": false`. Only
  M7's human confirmation flips that to true (D-108).
- **QA gate** — blocking, not advisory. Refuse to export if: any polygon lacks an id, any
  id is duplicated, any label is unmatched, plot count disagrees with the expected count
  when one was supplied, any area falls outside a sane band, or any two plot polygons
  overlap.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Emitted SVG contains zero styling attributes | `grep -cE '(fill\|stroke\|style)=' tools/pipeline/out/demo/colony.svg` returns 0 |
| 2 | Y-flip correct — plot A-01 is top-left in the render, as on the plan | Render and look |
| 3 | Golden comparison passes on ids, centroids, areas, facing, corner | `pytest tests/test_golden.py -q` |
| 4 | Injecting a duplicate id blocks the export | Synthetic test asserting a non-zero exit |
| 5 | Manifest carries `"verified": false` before M7 | Inspect the file |
| 6 | Two clean runs are byte-identical | `diff` two exports |
| 7 | `/review` returns no findings above the correctness bar | Reviewer output |
