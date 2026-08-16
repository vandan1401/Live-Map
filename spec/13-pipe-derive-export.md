# M13 — Derivation, export, and the automatic QA gate

**Tier 1** for the milestone (`tools/pipeline/pipeline/export/`); `pipeline/derive/**` stays
Tier 2 by path, so a later isolated tweak to a derived field does not need full ceremony.

Merged from the former M13 and M14 under D-118. They are one pass and one artifact: nothing
derived can be checked without exporting something to look at, and the QA gate's job is to
refuse an export whose derived fields are wrong. Splitting them meant describing the same
run twice.

## Goal

Compute everything the drawing does not state, write `colony.svg` and `colony.json` the app
can consume, and **refuse to write anything that would break it.**

## Build — derive

Everything the plan does not state explicitly but geometry can compute.

- **Roads by subtraction** — `site_boundary − union(plots, gardens, amenities, water)`. One
  shapely difference. Always correct regardless of how the draftsman drew the roads, and it
  costs nothing. Never extract roads from the source (D-104).
- **Trees procedurally** — offset the road polygon inward, sample at fixed intervals with
  jitter seeded from the colony id, emit `<use>` positions. Same seed means byte-identical
  output across runs, which is what makes the idempotency test meaningful (D-105). Also
  scatter inside garden polygons.
- **Facing** — find the nearest road edge to each plot, take its bearing, add `north_deg`,
  snap to eight compass points. East and north-facing plots carry a price premium in Indian
  plot sales, so this is a real field, not decoration.
- **`is_corner`** — the plot boundary touches road polygon on two or more non-parallel sides.
  Also a premium attribute.
- **`area_sqft`** — from the polygon and `px_per_ft`.

All computed once here and stored. Nothing recomputes them downstream (D-112).

None of this got easier under D-118. The drawing states where the plots are, not which way
they face or which are corners, and nobody computes those by hand for 300 plots. This half
is most of the pipeline's remaining value.

## Build — export

- **Normalise** — translate so min x,y is zero, **flip Y** (CAD counts up, SVG counts down),
  scale to viewBox width 1000. Store the transform so real-world coordinates can be recovered
  later. Forgetting the flip renders the whole plan mirrored, and mirrored looks plausible,
  which is why it gets its own test (D-110).
- **Emit SVG** per the contract in `spec/00-rules.md`. Zero styling attributes. `<use>`
  elements carry explicit `width` and `height`.
- Embed a minimal fallback `<style>` block **inside** the file so it is viewable standalone
  during QA. The app's stylesheet overrides it. Without this an unstyled SVG opens as solid
  black shapes, which is disorienting when checking a new colony.
- **Emit manifest** including `source` provenance (D-116) and `"verified": false`. Only
  M14's human confirmation flips that to true (D-108). `source.method` is `"dxf"`.

## Build — the QA gate

Blocking, not advisory. Refuse to export if any polygon lacks an id, any id is duplicated,
any label is unmatched, the plot count disagrees with `expected_plots`, any area falls
outside a sane band, any two plot polygons overlap, or any plot number exceeds
`number_width`.

Two checks are new under D-118:

- **Id stability.** If `out/<colony>/colony.json` already exists, refuse when any `svg_id`
  present in it is absent from the new export, unless `--allow-id-change` is passed. A re-id
  orphans the `plots` and `plot_history` rows already in the database — invariant 5's
  evidence trail — and it happens silently, because the new export looks perfectly correct
  on its own. This is the one QA check whose failure mode lives in the *other* half of the
  repo.
- **Scale**, replacing D-111's calibration step. `px_per_ft` is asserted in the colony config;
  refuse if any resulting `area_sqft` falls outside a sane band for a residential plot. A DWG
  in millimetres read as feet fails here loudly instead of shipping a colony of 400-sqft plots.

The gate is worth more since D-118, not less. The error source is now a human normalising a
drawing rather than a detector, and human error is quieter — a mis-typed plot number looks
perfectly correct. A blocking gate is what catches it.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Road polygon covers the gaps between plots and touches no plot interior | Geometric assertion |
| 2 | Facing, `is_corner`, and areas match the golden manifest for all 26 plots | `pytest tests/test_golden.py -q` |
| 3 | Golden comparison also passes on ids and centroids | Same |
| 4 | Emitted SVG contains zero styling attributes | `grep -cE '(fill\|stroke\|style)=' tools/pipeline/out/shree-vatika-2/colony.svg` returns 0 |
| 5 | Y-flip correct — plot A-01 is top-left in the render, as on the plan | Render and look |
| 6 | Two clean runs are byte-identical, tree positions included | Run twice, `diff` two exports |
| 7 | Manifest carries `"verified": false` before M14 | Inspect the file |
| 8 | Injecting a duplicate id blocks the export | Synthetic test asserting a non-zero exit |
| 9 | A `px_per_ft` off by 1000× is refused by the scale check | Synthetic test |
| 10 | A plot number wider than `number_width` blocks the export | Synthetic test |
| 11 | An export dropping an `svg_id` present in the previous one is refused without `--allow-id-change` | Synthetic test |
| 12 | Full gate passes | `make gate` |
| 13 | `/review` returns no findings above the correctness bar | Reviewer output |
