---
paths:
  - "apps/map/src/features/**/*.ts"
  - "apps/map/src/features/**/*.tsx"
  - "apps/map/src/lib/colony/**/*.ts"
  - "apps/map/src/lib/db/**/*.ts"
  - "apps/map/src/shared/**/*.ts"
  - "apps/map/scripts/**/*.ts"
  - "tools/pipeline/pipeline/io/**/*.py"
  - "tools/pipeline/pipeline/extract/**/*.py"
  - "tools/pipeline/pipeline/derive/**/*.py"
  - "tools/pipeline/tests/**/*.py"
---

# Tier 2 — features, extraction, data access

## apps/map

Build and `/check`. No `/plan` required unless the task turns out to write plot state — in
which case stop, it is Tier 1.

### Layer discipline

`supabase.from(...)` appears only in `apps/map/src/lib/db/`. A query anywhere else is a review
finding, not a shortcut. Features import from `apps/map/src/lib/*`; they never import from each
other.

### Colony loading

The SVG is geometry, the manifest is attributes, the database is state. Keep them separate:

- Never write status into the SVG. Set `data-status` on the DOM node at runtime (D-004).
- Never move a static feature — road, garden, amenity — into Postgres. They ship as files
  because they never change after import (D-005).
- Validate the join at **import** time: every `svg_id` in the manifest must match a path in
  the SVG, and every seed row must match a manifest entry. A plot row with no matching path
  renders nowhere and is invisible in the UI, which is worse than a loud failure.

### Derived fields

`facing` and `is_corner` are computed once at import and stored. Nothing recomputes them at
render time. Two sources for one fact will eventually disagree, and the UI will show
whichever one it happened to read.

### Numbers

Any number that encodes a business trade-off — a recency window, a page size, a debounce —
lives in a named constant with a comment saying why it has that value. Not inline in a
component. A magic number in a component is a decision nobody can find later.

## tools/pipeline

Build and `/check`. No `/plan` needed unless the task turns out to touch matching, export,
or overrides — in which case stop, it is Tier 1.

### Format code stays at the edge

`fitz` and `cv2` live in `tools/pipeline/pipeline/io/` and `tools/pipeline/pipeline/extract/` and nowhere else. Both the
vector path and the raster path emit the **same** neutral intermediate structure: a list of
rings plus a list of `(text, point)` pairs.

That symmetry is the whole design. Everything downstream works identically regardless of
source, which is why the raster fallback can be built last without disturbing anything, and
why a DXF front end would plug in as a third producer touching nothing else.

If you find yourself passing a PyMuPDF object past this layer, that is a finding.

### Derive, do not extract

Roads are computed as `site − union(everything else)`. Never read from the source, however
tempting a road layer looks. The subtraction is always correct regardless of how the
draftsman drew things, and it is one shapely call.

Tree scatter is seeded from the colony id. Not `random()`, not the clock. Two clean runs
must produce byte-identical output — that is what makes the idempotency test meaningful,
and idempotency is what lets you rerun safely after a code change.

### Derived fields are computed once

`facing`, `is_corner`, and `area_sqft` are computed here and stored in the manifest. Nothing
recomputes them later. Two sources for one fact will eventually disagree and the app will
show whichever it happened to read.

### Numbers

Any threshold that encodes a judgement — snap tolerance, minimum face area, nearest-label
distance, area-cluster multiplier — is a named constant with a comment explaining the value.
Not inline. These are the numbers that get quietly tuned until the fixture passes and real
colonies break.
