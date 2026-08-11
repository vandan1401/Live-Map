# M10 — Vector extraction

**Tier 2** (`tools/pipeline/pipeline/extract/vector.py`).

## Goal

From a vector PDF, get exact polygons and exact labels with no thresholding, no contour
detection, and no OCR.

## Build

- `page.get_drawings()` gives every stroke and fill with real coordinates.
  `page.get_text("words")` gives every label with its bounding box. That is essentially
  what DXF would have given, without needing DXF (D-101).
- Convert drawing items to closed rings. Handle the three shapes CAD exports produce:
  a true closed polyline, a rectangle primitive, and a run of separate line segments that
  visually form a rectangle but are not connected.
- Emit a neutral intermediate structure — a list of rings plus a list of
  `(text, insertion_point)` — and nothing format-specific beyond this module. Everything
  downstream must work identically whether the source was vector or raster (M9).
- Handle the three-PDF layer-separated export described in `README.md`: if given three
  files plotted to the same extents, use file 1 for polygons and file 2 for labels. This
  is the easy path and it should be a first-class input mode, not an afterthought.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Demo fixture yields ≥45 closed rings | `pytest tests/test_vector.py -q` |
| 2 | Demo fixture yields 45 plot-number labels | Same |
| 3 | Disconnected line segments still form a ring after snapping | Unit test with a synthetic gap of 0.001 units |
| 4 | The intermediate structure carries no PyMuPDF types | Import test — `tools/pipeline/pipeline/geom` must not need fitz |
| 5 | Layer-separated three-file mode produces the same rings | Test with the fixture split into three PDFs |
| 6 | Full gate passes | `make gate` |

## Non-goals

Deciding which ring is a plot. That is M4.
