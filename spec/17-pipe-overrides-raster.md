# M17 — Override durability, then the raster fallback

**Tier 1** for `tools/pipeline/pipeline/overrides/`, **Tier 2** for `tools/pipeline/pipeline/extract/raster.py`.

Two pieces of work, in this order. Overrides first, because reruns become common the
moment the raster path exists.

## Part A — override durability (Tier 1)

The failure this prevents is silent: you fix six plots, improve a detection heuristic a
week later, rerun, and your six corrections are gone. You will not notice until one of
them is wrong in the app.

- Store in `tools/pipeline/overrides/<colony>.json`, keyed by **rounded centroid**, not by array index
  and not by generated id — both change when detection changes (D-107).
- Reapply on every run, after matching and before export.
- An override whose key no longer matches any polygon is reported loudly, never dropped
  silently. Geometry moved; that needs a human.
- Overrides record what was changed and when, so a stale one can be reasoned about.

## Part B — raster fallback (Tier 2)

Deliberately last. Their files come from AutoCAD, so the vector path covers the common
case. This exists for the day someone sends a photo of a printed plan.

- Render PDF pages at 300 DPI or higher; resolution is the biggest single determinant of
  contour quality and it is free.
- `grayscale → adaptive threshold → morphological close → findContours(RETR_CCOMP) →
  approxPolyDP → filter by area`. `approxPolyDP` is the key call — it reduces a contour to
  its essential vertices, so a five-sided corner plot comes out as five points. Irregular
  shapes are handled natively; there is no rectangle assumption (D-103).
- OCR with PaddleOCR, EasyOCR as the fallback if PaddlePaddle fights the install. Feed
  results into the same M4 matching ladder — OCR strings are just labels.
- Expect 85–95% detection on a clean scan. The remainder go red in the verify page, which
  is exactly what it is for.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | An override survives a rerun after changing a detection threshold | Write, rerun, assert |
| 2 | An override whose geometry vanished is reported, not dropped | Synthetic test asserting the warning |
| 3 | Overrides are keyed by centroid, not index | Reorder the polygon list; overrides still apply |
| 4 | `demo-plan-scan.jpg` yields ≥40 of 45 plots automatically | `make ingest COLONY=demo-scan` |
| 5 | Raster output feeds the same matching ladder — no separate code path | Import test |
| 6 | `/review` returns no findings above the correctness bar on Part A | Reviewer output |

## Non-goals

A DXF front end. Conditional and probably never (D-115). If it is ever built, it plugs in
as an alternative producer of the M2 intermediate structure and touches nothing else.
