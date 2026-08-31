# The contract

`tools/pipeline` produces these two files. `apps/map` consumes them. Nothing else crosses
the boundary.

This is the reason the two halves can be built independently: the app has no idea whether
geometry came from a CAD drawing, a detector, or someone dragging rectangles over a phone
photo — today it is always a normalised DXF (D-118), and the contract would not notice if
that changed again. Change anything here and both halves change together, in one commit — which
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
| `amenity` | clubhouse, temple, tank, playground, parking, reserved/unplanned land, other | yes, info popup |
| `water` | ponds and water bodies | no |
| `plot` | one saleable parcel | yes, full detail sheet |
| `tree` | `<use href="#tree-canopy">` decoration | no |
| `plot-label`, `feature-label`, `entrance-label` | text | no |

`data-kind` carries identity within a class: `clubhouse`, `temple`, `tank`, `playground`,
`parking`, `park`, `reserved`, `other`. A new amenity type means a new `<symbol>`, not a new
CSS rule.

A `plot-label` carries `data-plot` (its plot's `svg_id`, for pairing with the `<path
class="plot">` it labels) and, when the source DXF label had them, `data-rotation` (degrees,
already converted to SVG's Y-down frame — negated from the DXF value, since flipping Y
mirrors rotation direction) and `data-label-height` (already scaled by the same transform as
every other coordinate). Both are the CAD operator's own choice of how that label sits on its
plot, read off the source entity, not derived (docs/plans/17.md, 2026-08-21) — `apps/map`
applies them at runtime (`transform`/inline `font-size`), the same way `data-status` drives
`colony-theme.css`'s `[data-status]` rules. Either or both may be absent (an older export, or
a label whose source entity carried no rotation) — the app falls back to unrotated, CSS
default size.

A `feature-label` (a classified garden/amenity/water feature's own text, or a free-floating
road/pathway annotation, docs/plans/19.md) carries `data-rotation` and `data-label-height`
the same way `plot-label` does, and `apps/map` applies them the same way — the DWG's own
font size and rotation, not a fixed constant. Either or both may be absent, same fallback as
`plot-label`. A `park`/`reserved`/`other`-kind feature's label is withheld entirely for now
(owner ask, 2026-08-24) — its `<path>`/`data-kind` still render, only the text does not;
this is a pipeline-side presentation choice (`pipeline/export/svg.py`'s
`_HIDDEN_FEATURE_KINDS`), not something `apps/map` filters. A road/pathway annotation is
never withheld this way regardless of which kinds are hidden — it has no `kind` at all.

Rules that break **silently** rather than loudly:

- **`<use>` must carry explicit `width` and `height`.** With neither, it defaults to 100% of
  the viewport and every tree scales to cover the whole map. Every unit test passed when
  this happened; only a raster render caught it.
- **Y is flipped** relative to CAD and PDF, which count upward. A mirrored plan looks
  entirely plausible — all the plots are present, all the roads connect.
- **Zero styling attributes.** One hardcoded fill and the "retheme every colony at once"
  guarantee is gone.

ID format: `plot-{BLOCK}-{NN}` — block uppercase, number zero-padded to two digits. A plot
with no block (docs/plans/15.md) uses `plot-{NN}` instead, with `"block": ""` in the
manifest — never an omitted field.
viewBox width is always 1000; height follows the aspect ratio.

## colony.json

```json
{
  "colony": {
    "id": "shree-vatika-2",
    "name": "Shree Vatika Phase 2",
    "viewbox": [0, 0, 1000, 720],
    "scale": { "px_per_ft": 2.6667 },
    "select_zoom": { "ref_width_px": 340, "ref_height_px": 238 },
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
      "confidence": "contained | nearest | manual" },
    { "svg_id": "plot-07", "block": "", "number": "07", "area_sqft": 1100,
      "length_ft": 33, "breadth_ft": 33,
      "centroid": [520, 310], "facing": "north", "is_corner": false,
      "confidence": "contained | nearest | manual" }
  ],
  "features": [
    { "svg_id": "garden-central", "class": "garden", "kind": "park",
      "label": "Central park", "centroid": [715, 485], "area_sqft": 0 }
  ]
}
```

**`select_zoom` is optional** — absent when the source DXF has no `COL-ZOOM-REF` rectangle
(docs/cad-layer-standard.md). `apps/map` then falls back to a fixed default zoom for that
colony instead of computing one from `ref_width_px`/`ref_height_px`.

**Roads and trees never appear here.** Both are derived — roads by subtraction, trees from a
per-colony seed — and storing a derived value creates a second source of truth that can
disagree with the generator.

## The `verified` flag

`false` on every export, without exception — the pipeline has no code path that writes
`true`. It is set exactly once, by a human confirming the upload in front of the rendered
map (M15). The app **refuses to render** a colony that is not verified.

A manifest arriving with `"verified": true` is therefore not trusted, it is **rejected**:
the file is plain text, so the flag in it is a claim, not evidence. Enforced on both sides
deliberately — a rule living only in the producing half gets bypassed the first time someone
copies a file by hand. See D-108, amended by D-025.

## Changing this contract

One commit touching `contract/`, both halves, and the fixture. If a change lands on one side
only, the schema test fails — which is the failure you want, because the alternative is the
app silently rendering an empty map with no error anywhere.
