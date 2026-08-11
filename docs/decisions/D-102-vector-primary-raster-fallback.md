# D-102 — Vector PDF path primary, raster fallback second

**Status:** accepted

## Decision

A vector PDF is parsed directly with PyMuPDF — `get_drawings()` for geometry,
`get_text("words")` for labels. Rasterisation, contour detection, and OCR exist only as a
fallback (M9), not as the main road.

## Reasoning

A PDF exported from DWG is not a picture of the drawing — it is still vector. Plot numbers
remain real text with exact positions, so OCR can be skipped entirely, along with
thresholding, contour detection, and every confidence score that comes with them. What you
get is essentially what DXF would have given: exact geometry and exact labels, without ODA
File Converter and without caring how the layers are named.

Because the vector path has no resolution, "laser sharp" stops being a concern. Sharpness is
a property of rasters. Render at 300 DPI or 3000 and both are exact.

The one export setting that matters: **"Microsoft Print to PDF" rasterises**, producing a
blurry image from a perfectly good drawing. `DWG To PDF.pc3` does not. The triage report in
M1 exists mostly to make that distinction obvious, because the fix is re-exporting, not
writing code.

## Rejected alternatives

- **Raster-only for uniformity** — one code path, and it would work. Rejected: it throws
  away exact coordinates and exact labels that are sitting right there, and imports OCR
  error as a permanent cost.
- **OCR even on vector PDFs** — no upside.

## Blast radius

Low. Both paths converge on the same intermediate structure by design.
