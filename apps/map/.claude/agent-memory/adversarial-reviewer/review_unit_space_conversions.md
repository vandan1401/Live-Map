---
name: review-unit-space-conversions
description: Recurring defect class in apps/map — SVG user-unit constants silently becoming screen-pixel constants (or vice versa) when ported into the canvas renderer
metadata:
  type: project
---

When reviewing `apps/map/src/components/map/**`, check every drawing constant for which
space it lives in. Constants inherited from the old SVG stylesheets were **all in SVG user
units** (they scaled with zoom, because Leaflet scaled the `<svg>`). In the canvas renderer
the context is pre-scaled by `k`, so dividing a constant by `k`/`scale` silently converts it
to a screen-constant — a different visual result at every zoom but the fit zoom.

**Why:** the 2026-08-22 canvas rewrite (docs/plans/18.md) did this inconsistently in one
pass: plot stroke and site-boundary stroke `/k`, dimension line width and dash `/scale`, but
the dimension label size and plot label size left in user units, and feature labels moved to
screen-constant while plot labels did not. `docs/plans/18.md` §3 pins these as owner-tuned
numbers ("0.5 user units") and §4 forbids re-tuning them, so a space change is a silent
re-tune.

**How to apply:** for each `/ k`, `/ scale`, or bare constant in a draw call, ask which the
plan pinned, and whether the constants that must look right *relative to each other* (a
dashed line and its own label; a chip and its text) are in the same space. Flag mixed pairs
as defects, not preferences.

Related: [[review-comments-outrun-code]]
