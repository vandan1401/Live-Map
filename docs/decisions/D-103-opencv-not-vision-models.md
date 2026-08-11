# D-103 — OpenCV contours for geometry, never a vision model

**Status:** accepted

## Decision

Polygon detection on rasters uses classical computer vision:
`grayscale → adaptive threshold → morphological close → findContours → approxPolyDP`.
No vision model, local or hosted, ever produces coordinates.

## Reasoning

A colony plan is a line drawing — high contrast, closed regions, no texture. That is
precisely the case OpenCV was built for, and it is deterministic, instant, free, and runs on
any laptop. `approxPolyDP` reduces each contour to its essential vertices, so a five-sided
corner plot comes out as five points. Irregular shapes are handled natively; nothing assumes
a rectangle.

Vision models — Claude, GPT-4V, Qwen2.5-VL, InternVL — are built to *describe* images, not
measure them. Asked for polygon vertices they return plausible-looking coordinates that
drift 10–30 pixels, hallucinate vertices on clean edges, and miscount past a few dozen
objects. On a 300-plot layout, correcting that output takes longer than tracing by hand.

The failure mode is what really disqualifies them: a hand-traced plot is either right or
obviously wrong, but a model-generated one is subtly off in ways nobody catches until
someone asks why plot B-22 looks bigger than B-23.

## Where models are genuinely useful

Reading plot **numbers** via local OCR, and parsing the family's existing status PDF into
structured rows. Both are text tasks. Neither produces coordinates.

## Rejected alternatives

- **SAM / MobileSAM** — good at irregular regions and runs locally, but overkill for line
  drawings where contours are faster and more precise, and the full model wants a GPU.
  Kept in reserve for a *rendered* masterplan with colours and shading, where thresholding
  struggles.
- **Per-colony LLM inference** — slower, costlier, less accurate than the tools above.
  Use a model to build the pipeline once, not to run it every time.

## Blast radius

Low. Contained to `pipeline/extract/raster.py`.
