# M12 — Identity and classification

**Tier 1** (`tools/pipeline/pipeline/matching/`).

Rewritten under D-118. Still Tier 1: a plot ID on the wrong polygon shows the wrong owner in
the app, and that consequence does not soften because the input got cleaner.

## Goal

Every polygon gets the right identity, and **anything ambiguous is a hard error**, not a
flag to sort out later.

## Build

### Identity

One containment test. A `COL-PLOT-NO` label belongs to the `COL-PLOT` ring that contains its
insertion point.

The old three-rung ladder (contained → nearest-within-threshold → flag) is deleted, and with
it the `nearest` distance threshold. That ladder existed because PDF text positions and OCR
output are unreliable; a label the owner placed inside its own plot is not. Every outcome
other than exactly-one-label-in-exactly-one-plot is an error naming the entity handle:

- a plot with no label → error
- a plot with two or more labels → error
- a label inside no plot → error
- two plots claiming the same number → error

### Block resolution and padding

The drawings carry bare numbers — `1`, `2`, … `10`, `11` — with no block prefix, and
occasionally an explicit one. The contract stores `plot-A-07`. This module owns that
transform; the owner never renumbers by hand (D-118).

Regex-validate every label against `^([A-Z]+-)?[0-9]+$` before matching, so a stray
dimension string can never become a plot number. Then:

1. No prefix → the **first** entry of the config's `blocks` list.
2. An explicit prefix → that block, **only if it appears in `blocks`**. A prefix outside the
   list is an error, not a new block — otherwise a stray `S-7` silently invents block `S`.
3. Reject any number outside the config's `number_range`. This is the only guard against a
   mis-typed plot number — `170` where `17` was meant looks correct in AutoCAD and no
   geometry check will catch it. Gaps within the range are fine; the check is a typo net,
   not a contiguity rule.
4. Zero-pad the number to the config's `number_width`. A number wider than `number_width` is
   an error, never a silent overflow.

`number_width` is read from config and never derived from the drawing. Deriving it would
mean a colony growing from 99 to 100 plots re-pads every id, changing every `svg_id` and
orphaning the `plots` and `plot_history` rows already in the database — invariant 5's
evidence trail, broken by adding a plot. The width is fixed for the life of the colony and
M14 refuses to export if the drawing outgrows it.

Report the split — how many plots took the default block and how many carried an explicit
prefix — so an unexpected prefix is visible without being fatal.

`confidence` is still written to the manifest and is always `manual` on this path — the
schema allows it, the verify page reads it, and the honest value for a
human-normalised drawing is `manual`. It is no longer a signal of doubt; the QA gate is.

### Classification

Read the layer. `COL-PLOT` → plot, `COL-GARDEN` → garden, `COL-AMENITY` → amenity,
`COL-WATER` → water. Roads are never classified because they are never drawn (D-104).

Area clustering, the keyword ladder over large polygons, and the "unclassified defaults to
garden" rule are all deleted — they were inference over an unlabelled drawing. What remains
is `kind`, resolved from the `COL-FEATURE-NO` label against the keyword table in
`docs/cad-layer-standard.md`. A feature label matching no keyword is an error, not a default.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Shree Vatika fixture: 26 plots identified, 0 errors | `make ingest COLONY=shree-vatika-2 DXF=fixtures/shree-vatika-2/colony.dxf` |
| 2 | Every id matches `fixtures/shree-vatika-2/colony.json` exactly | `pytest tests/test_golden.py -q` |
| 3 | A label outside every plot is an error naming its handle | Synthetic test asserting non-zero exit |
| 4 | Two labels in one plot is an error naming both handles | Synthetic test |
| 5 | A plot with no label is an error | Synthetic test |
| 6 | Duplicate plot numbers on two plots is an error | Synthetic test |
| 7 | A dimension string (`12.5M`, `7A`) is never assigned as a plot number | Synthetic test |
| 8 | Bare `7` with `blocks: ["A"]`, `number_width: 2` yields `plot-A-07` | Unit test |
| 9 | `B-7` with `blocks: ["A","B"]` yields `plot-B-07`; with `blocks: ["A"]` it errors | Unit test |
| 10 | Number `100` with `number_width: 2` is an error, not `plot-A-100` | Unit test |
| 11 | Number `170` with `number_range: [1, 60]` is an error | Unit test |
| 12 | A colony of bare-numbered plots produces ids that sort in numeric order as strings | Unit test |
| 13 | A `COL-AMENITY` ring labelled `CLUB HOUSE` classifies as `clubhouse`; one labelled `XYZ` errors | Synthetic test |
| 14 | `/review` returns no findings above the correctness bar | Reviewer output |

## Non-goals

Fixing bad matches. Under D-118 the fix is in the DXF, not in a tool — see M14.
