# CAD layer standard

What a colony's DXF must contain for `make ingest` to accept it. Per D-118, the pipeline
reads DXF only and **refuses anything that does not conform** — it never repairs or guesses.

This is a contract, not a suggestion. If the reader rejects a file, the fix is in AutoCAD.

## Layers

Names are exact and case-sensitive. Any layer not listed here is **ignored**, so you can
leave the title block, dimensions, hatches, and marketing overlays where they are — just do
not name them one of these.

| Layer | Entity | Count | Meaning |
|---|---|---|---|
| `COL-SITE` | closed `LWPOLYLINE` | exactly 1 | Colony boundary. Everything else must fall inside it |
| `COL-PLOT` | closed `LWPOLYLINE` | 1 per plot | A saleable plot |
| `COL-PLOT-NO` | `TEXT` or `MTEXT` | 1 per plot | Plot number. Insertion point must fall **inside its own plot** |
| `COL-GARDEN` | closed `LWPOLYLINE` | 0+ | Garden, park, open space, green |
| `COL-AMENITY` | closed `LWPOLYLINE` | 0+ | Clubhouse, temple, playground, parking, reserved/unplanned land, other |
| `COL-WATER` | closed `LWPOLYLINE` | 0+ | Tank, sump, OHT |
| `COL-FEATURE-NO` | `TEXT` or `MTEXT` | 1 per feature, plus 0+ road/pathway annotations | Inside a garden/amenity/water ring: that feature's label. Inside no ring: a free-floating road/pathway annotation ("9.0 M W ROAD") |
| `COL-NORTH` | one `LINE` | 0 or 1 | Tail → head points north. Sets `north_deg` |
| `COL-ZOOM-REF` | closed `LWPOLYLINE`, or an `INSERT` of a block containing exactly one closed `LWPOLYLINE` | 0 or 1 | Reference rectangle: the real-world area that should fill the screen when a plot in this colony is selected in the app. The owner's own framing judgement, not derived from plot size or site size — draw it axis-aligned to this drawing's X/Y axes, the same assumption every other measurement in this pipeline makes |

If `COL-NORTH` is absent, `north_deg` must be stated in the colony config instead. If both
are present they must agree within 1°, or ingest fails — two sources that disagree about
north silently rotate every plot's `facing`, and `facing` carries a real price premium.

If `COL-ZOOM-REF` is absent, the colony simply has no `select_zoom` in its manifest and the
app falls back to its own fixed default zoom for that colony — nothing fails, nothing is
required. Drawing this rectangle is optional, per-colony, and can be added or changed at any
time by re-exporting.

**Recommended workflow**: define a reference rectangle once as an AutoCAD block (a 9:16
portrait rectangle, matching a phone screen, is a sensible default — e.g. `RECTANG` a 9x16
or 90x160 unit box, then `BLOCK` it), then for each colony `INSERT` a copy on
`COL-ZOOM-REF` and scale it to whatever real-world size should fill the screen on selection
for that colony. The reader resolves the block's placed, scaled geometry into real drawing
coordinates automatically (uniform or non-uniform scale both work) — you never need to
redraw the rectangle from scratch per colony, only place and scale one copy of the block.
A plain closed `LWPOLYLINE` drawn directly on the layer works exactly the same way if you'd
rather not use a block.

### Do not draw roads

Roads are computed as `site − (plots ∪ gardens ∪ amenities ∪ water)` — one subtraction,
always correct regardless of how the road was drawn (D-104). A road layer, if present, is
ignored. Trees are generated procedurally (D-105); do not draw those either.

This is real work you get to skip, not a limitation.

## Plot numbers

**Leave them exactly as the plan already has them.** Bare numbers — `1`, `2`, … `10`, `11`,
with no prefix — are the expected case. You never renumber anything by hand.

The app's schema pins the *stored* format: `svg_id` matches `^plot-(?:[A-Z]+-)?[0-9]{2,}$`,
built from an optional block (`^[A-Z]*$`) and a number (`^[0-9]{2,}$`). Getting from a bare
`7` to `plot-A-07` is a mechanical, lossless transform, so the pipeline does it — see "what
belongs in AutoCAD" in D-118. Three config values control it:

- **`blocks`** — every block letter this colony uses, whether from an explicitly prefixed
  label (`B-7`) or as the target of `default_block` below. A prefix outside this list is an
  error, so a stray `S-7` cannot quietly invent a block — and `default_block` is validated
  against this same list, for the same reason.
- **`default_block`** — the block a *bare* (unprefixed) label resolves to; must be one of
  `blocks`, or config loading fails. Omit it and it defaults to `blocks[0]`, matching the
  historical one-block-per-colony convention. Set it explicitly to `null` when bare numbers
  are genuinely blockless plots, distinct from any lettered block — e.g. a colony where bare
  `1`–`6` and explicit `A-1`–`A-6` are two different sets of real plots, not the same plots
  under two labels (docs/plans/15.md). A bare label then resolves to `plot-{NN}` with
  `"block": ""` in the manifest, never an omitted field.
- **`number_width`** — how many digits every number is zero-padded to.

With `"blocks": ["A"]` and `"number_width": 2`:

| Text in the DXF | Result |
|---|---|
| `7` | ✅ `plot-A-07` — default block, padded |
| `11` | ✅ `plot-A-11` |
| `B-7` | ❌ rejected — `B` is not in `blocks`. Add it if the colony really has a B block |
| `a-7` | ❌ rejected — block must be uppercase |
| `7A` | ❌ rejected — not a number |
| `12.5M` | ❌ rejected — dimension text is never a plot number |

Mixed prefixes are fine when every prefix is declared. With `"blocks": ["A", "B"]`, a plan
where most plots are bare and a few read `B-7` works: the bare ones become block `A`, the
prefixed ones block `B`. The ingest report prints how many took the default and how many
carried an explicit prefix, so an unexpected prefix is visible immediately without being
fatal.

`MTEXT` formatting codes are stripped before matching, so bold or a font override is fine.
Leading/trailing whitespace is stripped. Nothing else is normalised.

### Why `number_width` is pinned in config and not computed

If the width were derived from the largest number in the drawing, a colony that grows from
99 plots to 100 would re-pad every id from `07` to `007` — silently changing every `svg_id`
and orphaning every `plots` row and every `plot_history` entry already in the database. That
history is the evidence that settles a commission dispute (invariant 5), so it must not be
possible to break it by adding a plot.

Pinned in config, the width is fixed for the life of the colony and the export gate refuses
to run if the drawing outgrows it. Pick it once, with headroom: `2` for a colony under 100
plots, `3` under 1000.

It also makes ids sort correctly as strings, which is what the app's table view relies on
(`.order("svg_id")`) — `plot-A-011` before `plot-A-101`, where unpadded `11` would sort
after `101`.

### Feature labels

Free text, matched case-insensitively against the same keywords the classifier already used,
checked in this order (`PARKING` before `PARK` — it is a substring of it, so the reverse
order would silently classify every parking lot as a park):
`CLUB`/`COMMUNITY` → clubhouse, `PARKING` → parking,
`GARDEN`/`PARK`/`OPEN SPACE`/`GREEN` → park, `TEMPLE`/`MANDIR` → temple,
`OHT`/`TANK`/`SUMP` → tank, `RESERVED` → reserved, `OTHER` → other. A feature whose
label matches nothing is **rejected**, not defaulted — name it something recognisable.
This keyword table applies only to a `COL-FEATURE-NO` label whose insertion point falls
**inside** a `COL-GARDEN`/`COL-AMENITY`/`COL-WATER` ring.

A `COL-FEATURE-NO` label whose insertion point falls inside **no** ring at all — a road or
pathway width/name text such as "9.0 M W ROAD" or "ROAD TO SAILANA" — is not a feature and
is never matched against the keyword table or rejected for failing to match it. It is
rendered as a free-floating road/pathway annotation exactly as written (docs/plans/19.md).

## Units and scale

Draw in **feet, 1 drawing unit = 1 foot**. State it anyway in the colony config; the export
gate checks it against a plot whose real dimensions you already know, so a wrong unit fails
loudly instead of producing a colony of 400-square-foot plots (D-118, superseding D-111).

If a legacy DWG is in millimetres or metres, scale it once in AutoCAD (`SCALE`) rather than
recording a conversion factor — one drawing, one unit, no arithmetic downstream.

## Colony config

One file per colony, `tools/pipeline/colonies/<colony-id>.json`. Colony-specific values live
here, never in code (`spec/00-rules.md`).

```json
{
  "id": "shree-vatika-2",
  "name": "Shree Vatika Phase 2",
  "units": "ft",
  "expected_plots": 26,
  "blocks": ["A"],
  "number_width": 2,
  "number_range": [1, 60],
  "north_deg": null,
  "source": {
    "file": "shree-vatika-2-as-sold.dwg",
    "revision": "Rev D (as sold)",
    "plan_date": "2019-11-04",
    "method": "dxf"
  }
}
```

`expected_plots` is what makes M14's QA gate able to catch a plot you missed while cleaning
up. Fill it in from the sanctioned layout, not from what the drawing appears to contain.

`blocks: ["A"]` is the right answer for a plan with bare numbers and no lettered blocks —
which is most of them. `north_deg: null` means "read it from `COL-NORTH`".

`number_range` is the cheap guard against a mis-typed number. A plot labelled `170` where
`17` was meant is the quiet failure this whole path has to worry about — it looks perfectly
correct in AutoCAD, and no geometry check catches it. Declaring the range the colony's
numbering actually spans turns it into a hard error. Set it generously; it exists to catch
a typo, not to enforce contiguity, and gaps in numbering are fine.

## Two rules before you touch a drawing

**Work on a copy.** Save the original DWG as `<colony>-colony-source.dwg` and normalise
that. The originals are business records — the as-sold layout can matter in a registry or
commission question years from now, and text deleted from a master file is gone.

**Assign, never delete.** Every layer not named in the standard is ignored, so junk costs
nothing by being present. Clearing out dimension strings and road names to leave "only plot
numbers" is more work *and* less safe, because the two approaches fail in opposite
directions:

| Approach | A mistake produces |
|---|---|
| Delete everything that is not a plot number | One missed `1500` becomes a candidate plot number. **Silent** — it reaches the app as a real plot |
| Select the plot numbers onto `COL-PLOT-NO` | One missed number produces `plot <handle> has no label`. **Loud** — names the entity, one click to fix |

Name what counts. Never trust yourself to have removed everything that doesn't.

## Per-colony procedure

The billable unit of work. Roughly 20–40 minutes for a clean DWG.

1. **Confirm you have the as-sold / final sanctioned layout**, not the latest working
   drawing. Rev G with a garden turned into four plots renders a map that quietly
   contradicts the registry — the single worst failure in this project (D-116).
2. Save a copy to work in. `AUDIT` → fix, then `PURGE`.
3. Create the eight required layers above (`COL-ZOOM-REF` is optional — create it too now
   if you already know you'll want it, or add it later with a re-export).
4. Move plot outlines onto `COL-PLOT`.
5. **Join exploded outlines**: `PEDIT` → `Multiple` → select → `Join` → `Close`. This is the
   step that replaces the largest and least testable chunk of the old pipeline design. A plot
   that merely *looks* shut is not closed — `LIST` must say `Closed`.
6. Move plot numbers onto `COL-PLOT-NO` — `QSELECT` or `SELECT SIMILAR` on their text style
   or height, then change layer. Leave dimension strings, road names, and the title block
   exactly where they are; they are ignored. Middle-Center justification is easiest, since
   the insertion point then sits visibly inside the plot.
7. **Do not renumber anything.** Instead set `blocks` and `number_width` in the colony
   config to match what the drawing already says — `["A"]` and `2` for a bare-numbered plan
   under 100 plots.
8. Draw `COL-SITE` if the plan has no boundary polyline.
9. Draw the `COL-NORTH` line, tail to head, matching the plan's north arrow — or, if the
   plan has no north arrow, put `north_deg` in the config instead.
10. **Check units**: `DIST` across a plot you know the size of. A 30×50 plot must read 30 by 50.
11. `SAVEAS` → **AutoCAD 2013 ASCII DXF** (`*.dxf`).
12. `make ingest COLONY=<id> DXF=<path>`. Read the errors, fix them in AutoCAD, re-export,
    repeat. The reader names the layer and entity handle, so each error maps to one `SELECT`.
13. `make serve`, open the verify page, confirm the render matches the plan, click
    **Mark verified**. Until that click the manifest carries `"verified": false` and the app
    refuses to render it (D-108, invariant 2).

## Common rejections

| Message | Cause | Fix in AutoCAD |
|---|---|---|
| `COL-PLOT entity <handle> is not closed` | Exploded outline, or a polyline drawn back to its start without `Close` | `PEDIT` → `Join`, then `Close` |
| `plot <handle> has no label` | Number is on the wrong layer, or its insertion point sits outside the outline | Move to `COL-PLOT-NO`; re-justify Middle-Center |
| `plot <handle> has 2 labels` | A duplicated or leftover number sits inside the plot | Delete the stray |
| `label 'B-7' uses block B, not in blocks ["A"]` | A prefix the config does not declare | Add `"B"` to `blocks`, or fix a stray label |
| `label '7A' is not a plot number` | Suffixed or malformed number | Correct the text in AutoCAD |
| `number 170 outside number_range [1, 60]` | Mis-typed plot number, or a stray bare number left on `COL-PLOT-NO` | Fix the text, or widen the range if the colony really numbers that high |
| `number 100 exceeds number_width 2` | Colony outgrew its pinned id width | Do **not** widen a colony already imported — see the `number_width` section |
| `plots <h1> and <h2> overlap` | Shared boundary drawn twice, slightly offset | Redraw one edge, or snap the vertices |
| `expected 26 plots, found 25` | One outline missed during cleanup | Compare against the sanctioned layout |
| `COL-SITE has 2 entities` | Phase boundary left on the site layer | Move the phase boundary to an ignored layer |
