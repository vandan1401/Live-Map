# M12 — Matching and classification

**Tier 1** (`tools/pipeline/pipeline/matching/`). The highest-consequence module in this repo.

## Goal

Every polygon gets the right identity, and anything uncertain is flagged rather than
guessed. A plot ID on the wrong polygon shows the wrong owner in the app.

## Build

### Assignment ladder — in order, each catching what the previous missed

1. Label insertion point falls inside a polygon → assign.
2. Not inside anything → assign to the nearest polygon centroid **if** within a distance
   threshold. Pin that threshold in the plan; it is a business trade-off, not a constant.
3. Still unmatched, or two labels inside one polygon → flag for manual review. Never guess.

Regex-validate every label against the plot-number pattern first, so stray text like
"12.5M" or a dimension never gets assigned.

Record **how** each match was made in `confidence`: `contained`, `nearest`, or `manual`.
That field is what tells the verify page which plots to show red.

### Classification — in order

1. Roads are never detected. They are computed in M5 by subtraction.
2. Area clustering — plot areas cluster tightly. Within ~2× the modal area is a plot.
3. Keyword match on text inside large polygons: `CLUB`/`COMMUNITY` → clubhouse,
   `GARDEN`/`PARK`/`OPEN SPACE`/`GREEN` → garden, `TEMPLE`/`MANDIR` → temple,
   `OHT`/`TANK`/`SUMP` → tank, `PARKING` → parking. `EWS`/`LIG` are still plots.
4. A polygon containing a valid plot number is a plot regardless of size. This overrides
   the area rule and is what catches oversized corner plots.
5. Unclassified → default `garden`, flagged for review.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Demo fixture: 45 plots matched, 0 unmatched, 0 duplicates | `make ingest COLONY=demo PDF=fixtures/demo-plan.pdf` |
| 2 | Every id matches the golden manifest exactly | `pytest tests/test_golden.py -q` |
| 3 | A label outside every polygon triggers the nearest rung and is marked `nearest` | Synthetic test |
| 4 | Two labels in one polygon flags both, assigns neither | Synthetic test |
| 5 | A dimension string is never assigned as a plot number | Synthetic test |
| 6 | Clubhouse, temple, tank, and park classify correctly on the fixture | Golden comparison |
| 7 | `/review` returns no findings above the correctness bar | Reviewer output |

## Non-goals

Fixing bad matches. That is the verify page (M7).
