# M16 — Tracing tools

**Tier 1** (`tools/pipeline/verify/tracer.js`). The tools that make any input tractable, including a
photo of a printed plan.

## Goal

Draw plots by hand fast enough that detection quality stops being the bottleneck. Target:
a 300-plot colony in under 15 minutes with no CAD file at all.

## Build

- **Row tool.** Drag a rectangle across a row of plots, type the count and the starting
  number. It subdivides evenly and labels automatically. A colony is maybe 25 rows, so this
  alone covers most of the work at roughly 30 seconds a row.
- **Curved row tool.** Plots along a curved road are the most common irregular case and are
  all wedge-shaped. Define the inner arc, the outer arc, and a count; subdivide radially
  into trapezoids. One interaction handles fifteen plots.
- **Polygon tool.** Click each vertex for genuinely irregular plots. Twenty to forty per
  colony at fifteen seconds each.
- **Corner-drag.** Pull individual corners of a traced row to taper it.
- **Two-point scale calibration.** Click two points on the drawing's scale bar or a known
  dimension, type the real distance, derive `px_per_ft` (D-111). Thirty seconds, once per
  colony, and it removes the last reason to need CAD units.
- **Background image mode** — load a PDF page render or a photo as a backdrop and trace
  over it. This is what makes the tool input-agnostic.
- **Row templates** — save and reload a row configuration. The same developer reuses plot
  dimensions across projects, so colony three onwards is faster than colony two.

Output is identical to the automatic path: same classes, same id format, same manifest.
Nothing downstream can tell the difference, and that is deliberate.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | A 5-plot row traced by hand produces 5 correctly numbered plots | Manual |
| 2 | Curved row produces N trapezoids with no gaps or overlaps | Geometric assertion on the output |
| 3 | Scale calibration on the fixture recovers `px_per_ft` within 2% | Compare to golden |
| 4 | Hand-traced output passes the same M6 QA gate as automatic output | `make export` |
| 5 | A colony traced entirely by hand from `demo-plan-scan.jpg` exports cleanly | Manual, timed |
| 6 | `/review` returns no findings above the correctness bar | Reviewer output |
