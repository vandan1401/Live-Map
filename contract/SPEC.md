# The contract

`tools/pipeline` produces these two files. `apps/map` consumes them. Nothing else crosses
the boundary.

This is the reason the two halves can be built independently: the app has no idea whether
geometry came from a vector PDF, an OpenCV contour run, or someone dragging rectangles over
a phone photo. Change anything here and both halves change together, in one commit — which
is the whole point of keeping them in one repo.

Validated on both sides against `contract/colony.schema.json`. If you change this document
and not the schema, the tests fail. That is deliberate.

## colony.svg

Geometry only. `class`, `id`, `data-*`. **No `fill`, no `stroke`, no `style`, ever.**

| class | Used for | Interactive |
|---|---|---|
| `site-boundary` | outer perimeter | no |
| `road` | negative space, one compound path | no |
| `garden` | parks and open space | yes, info popup |
| `amenity` | clubhouse, temple, tank, playground, parking | yes, info popup |
| `water` | ponds and water bodies | no |
| `plot` | one saleable parcel | yes, full detail sheet |
| `tree` | `<use href="#tree-canopy">` decoration | no |
| `plot-label`, `feature-label`, `entrance-label` | text | no |

`data-kind` carries identity within a class: `clubhouse`, `temple`, `tank`, `playground`,
`parking`, `park`. A new amenity type means a new `<symbol>`, not a new CSS rule.

Rules that break **silently** rather than loudly:

- **`<use>` must carry explicit `width` and `height`.** With neither, it defaults to 100% of
  the viewport and every tree scales to cover the whole map. Every unit test passed when
  this happened; only a raster render caught it.
- **Y is flipped** relative to CAD and PDF, which count upward. A mirrored plan looks
  entirely plausible — all the plots are present, all the roads connect.
- **Zero styling attributes.** One hardcoded fill and the "retheme every colony at once"
  guarantee is gone.

ID format: `plot-{BLOCK}-{NN}` — block uppercase, number zero-padded to two digits.
viewBox width is always 1000; height follows the aspect ratio.

## colony.json

```json
{
  "colony": {
    "id": "shree-vatika-2",
    "name": "Shree Vatika Phase 2",
    "viewbox": [0, 0, 1000, 720],
    "scale": { "px_per_ft": 2.6667 },
    "north_deg": 0,
    "generated": "2026-08-11",
    "verified": false,
    "source": { "file": "...", "revision": "F", "plan_date": "2023-11-14",
                "method": "vector-pdf | raster | traced | dxf" }
  },
  "plots": [
    { "svg_id": "plot-A-14", "block": "A", "number": "14", "area_sqft": 1237,
      "length_ft": 35, "breadth_ft": 35,
      "centroid": [412, 288], "facing": "east", "is_corner": true,
      "confidence": "contained | nearest | manual" }
  ],
  "features": [
    { "svg_id": "garden-central", "class": "garden", "kind": "park",
      "label": "Central park", "centroid": [715, 485], "area_sqft": 0 }
  ]
}
```

**Roads and trees never appear here.** Both are derived — roads by subtraction, trees from a
per-colony seed — and storing a derived value creates a second source of truth that can
disagree with the generator.

## The `verified` flag

`false` on every automatic export. Only a human pass in the verify page sets it `true`, and
there is no code path that does. The app **refuses to import** a manifest that is not
verified.

Enforced on both sides deliberately. A rule living only in the producing half gets bypassed
the first time someone copies a file by hand. See D-108.

## Changing this contract

One commit touching `contract/`, both halves, and the fixture. If a change lands on one side
only, the schema test fails — which is the failure you want, because the alternative is the
app silently rendering an empty map with no error anywhere.
