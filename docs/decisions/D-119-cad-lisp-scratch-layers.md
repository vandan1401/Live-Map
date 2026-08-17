# D-119 — Pre-normalisation AutoLISP toolkit writes only to scratch layers

**Status:** accepted
**Date:** 2026-08-17
**Range:** tools/pipeline (D-1xx) — upstream of D-118, not part of `tools/pipeline` itself

## Context

The per-colony procedure in `docs/cad-layer-standard.md` is ~20–40 minutes of manual
AutoCAD work per colony: creating layers, deduping overlapping outlines, joining
exploded polylines, moving plot numbers onto `COL-PLOT-NO`, checking units, exporting.
Most of it is mechanical drudgery, not judgement — a good target for automation.

`tools/cad-lisp/cv-tools.lsp` (AutoLISP, standalone, no dependency on `contract/`,
`apps/map`, or `tools/pipeline`) automates the messiest part: merging/deduping raw line
geometry (`CV-MERGE`, via AutoCAD's own `OVERKILL`) and auto-tracing closed plot
outlines from that geometry (`CV-CLOSE`, via AutoCAD's `BOUNDARY`, bridging small gaps
and flagging the rest rather than guessing at them).

## Decision

The toolkit never writes to `COL-SITE`/`COL-PLOT`/`COL-PLOT-NO`/etc. directly. Every
command's output lands on a scratch/draft layer instead:

- `CV-MERGE` → `CV-MERGED`
- `CV-CLOSE` → `CV-PLOT-DRAFT` (auto-traced regions), `CV-FLAGS` (unresolved gaps)

Promoting a draft region onto the real `COL-*` layers is a deliberate, separate, manual
step the human still performs after reviewing the draft against the plan.

## Why

D-118 already drew the line this decision extends: mechanical transforms (block
resolution, zero-padding) stay in code; judgement (which ring is a plot, is it closed,
is this the as-sold revision) stays in AutoCAD, and the pipeline itself never repairs or
guesses. `CV-CLOSE`'s gap-bridging is the one place in this toolkit that could silently
produce *wrong* geometry — auto-closing the wrong gap turns two plots into one, or
bridges across a real opening. Writing results to a draft layer instead of `COL-PLOT`
means a bad auto-trace costs a review glance, not a wrong plot boundary reaching
`make ingest` — and by extension, never reaches a buyer's registry entry or a commission
calculation (invariant 5's whole reason to exist).

The gap-bridging tolerance is also intentionally conservative and asymmetric: endpoints
closer than the tolerance get bridged (logged); anything wider is left alone and marked
on `CV-FLAGS` for a human to look at, never guessed at. Same shape as D-118's "ambiguity
is a hard error, not a confidence score."

## Rejected alternatives

- **Write auto-traced regions straight to `COL-PLOT`.** Faster per colony, but removes
  the review step entirely — a bridged gap that shouldn't have been bridged would reach
  `make ingest` looking like a normal plot, and nothing downstream would catch it (the
  Python reader only checks closedness/labels/counts, not whether a boundary is
  *correct*). Rejected: exactly the "looks fine on the map" failure mode this project's
  rules exist to prevent.
- **No auto-bridging at all — flag every open endpoint, close nothing automatically.**
  Safer, but defeats the point: real DWGs are full of sub-tolerance drafting gaps
  (a polyline drawn 0.02 ft short of its neighbour), and flagging all of them would just
  move the drudgery from "find overlaps" to "find gaps," not remove it. Rejected in
  favour of a small, conservative default tolerance the human sets per run.
- **Skip the scratch-layer indirection, rely on `UNDO` instead.** One `U` does reverse a
  `CV-CLOSE` run, but only if the human runs it inside the same session immediately
  after and notices something's wrong. A draft layer stays visibly separate and
  reviewable at any later point — including a different session, after other edits have
  happened in between. Rejected as too fragile for a step that's still upstream of a
  legal/financial record.

## Consequences

- `CV-CLOSE`/`CV-MERGE` need a `CV-PROMOTE`-style manual (or future, deliberately
  reviewed) step to move draft results onto `COL-*` — not built yet; the human currently
  does this by hand after eyeballing `CV-PLOT-DRAFT` against the plan.
- Every scratch layer this toolkit introduces (`CV-MERGED`, `CV-PLOT-DRAFT`,
  `CV-FLAGS`) is deliberately outside the `COL-*` vocabulary `docs/cad-layer-standard.md`
  defines, so the Python reader ignores it automatically — no risk of a leftover scratch
  layer being mistaken for real geometry on a future ingest.
