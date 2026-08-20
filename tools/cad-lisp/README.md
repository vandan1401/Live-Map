# CV Tools — AutoLISP helpers for colony DWG normalisation

Standalone AutoCAD tooling for the manual half of the per-colony procedure in
`docs/cad-layer-standard.md`. No dependency on `contract/`, `apps/map`, or
`tools/pipeline` — it never writes to the real `COL-*` layers directly, only
to scratch layers (`CV-MERGED`, `CV-PLOT-DRAFT`, `CV-FLAGS`) that you review
before promoting. Judgement calls (which ring is really a plot, is this the
as-sold revision) stay with you; this only removes drudgery upstream of that.

**Always run against a working copy of the DWG, never the original.**

## One-time setup (auto-load every session)

1. Note the folder this file is in, e.g. `C:\...\Colony Viewer\tools\cad-lisp`.
2. In AutoCAD: `Tools` menu (or the Application Menu) → `Options` →
   **Files** tab → **Support File Search Path** → `Add...` → browse to that
   folder → `OK` → `Apply`.
3. Find (or create) `acaddoc.lsp` in your AutoCAD support folder — typically
   `%APPDATA%\Autodesk\AutoCAD <version>\R<rel>\enu\Support\acaddoc.lsp`. If
   it doesn't exist, create a plain text file there with that exact name.
4. Add one line to it:
   ```lisp
   (load "cv-tools.lsp")
   ```
   Because the folder from step 2 is now on the support search path, AutoCAD
   finds `cv-tools.lsp` by filename alone — no full path needed.
5. Restart AutoCAD (or open any drawing) and check the command line for:
   `CV Tools loaded -- type CV-HELP for the command list.`

If you'd rather not touch `acaddoc.lsp` yet, you can load it manually per
session instead: type `APPLOAD`, browse to `cv-tools.lsp`, `Load`. Or just
drag the `.lsp` file from Explorer onto the open drawing window.

## Commands (Phase 1)

Run in roughly this order per colony:

1. **`CV-LAYERS`** — creates the eight `COL-*` layers plus the three `CV-*`
   scratch layers, if they don't already exist. Safe to run any time.
2. **`CV-MERGE`** — select the messy plot-outline geometry (window, crossing,
   or pick). Moves it onto `CV-MERGED` and runs AutoCAD's own `OVERKILL`
   command to delete duplicate/overlapping lines. Run it more than once if
   your outlines are scattered across several passes.
   - `OVERKILL`'s dedup tolerance is whatever you last configured (or
     AutoCAD's tight default). If dedup misses obvious overlaps, type
     `OVERKILL` (the dialog version) once, loosen the tolerance, `Cancel`
     out — CV-MERGE will use that setting from then on.
3. **`CV-HIDETEXT`** / **`CV-SHOWTEXT`** — toggle all `TEXT`/`MTEXT`
   visibility, regardless of layer, so you can see the geometry cleanly.
   Fully reversible, doesn't move or delete anything.
4. **`CV-CLOSE`** — **do not use on a real colony (D-119 follow-up).** It
   sweeps a grid of points across the whole drawing's bounding box, running
   one `-BOUNDARY` trace per point in a single AutoLISP command loop — for
   a real colony (hundreds of entities) that's thousands of calls, which
   has hung and then crashed AutoCAD outright (matches the "if CV-CLOSE
   ever appears to hang" warning below, but worse: a genuine crash, not
   just a slow hang). Its gap-bridging (`cv:bridge-gaps`) also has a
   correctness bug found while porting it to Python: when two entities'
   endpoints already exactly touch, only one of them gets marked resolved
   — the other can end up falsely flagged, or bridged to some unrelated
   point, at an ordinary already-closed corner. Use **`close_polygons.py`**
   instead (below); it replaces this command's job entirely and fixes both
   problems.
5. **`CV-NEXT`** — zooms to and highlights each flagged gap on `CV-FLAGS`
   in turn, so you're not hunting for them by eye. Only useful if you flag
   gaps some other way now that `CV-CLOSE` is retired — `close_polygons.py`
   below reports its flags directly.

Every command prints a one-line summary and appends a timestamped entry to
`<drawing-name>-cv-log.txt` next to the DWG — a paper trail of what ran and
what got auto-bridged, in case a plot boundary is ever questioned later.

Each command wraps its edits in one `UNDO` group, so a single `U` reverses
the whole thing.

## Closing plot polygons: close_polygons.py

Replaces `CV-CLOSE`. Same job — bridge small gaps, trace every closed
region — but as a standalone Python script instead of an AutoCAD command
loop, so it can't hang or crash AutoCAD and it traces the whole colony in
one pass instead of a blind grid sweep. No dependency on `cv-tools.lsp`,
`contract/`, or `tools/pipeline` — install its own requirements
(`pip install -r tools/cad-lisp/requirements.txt`, or reuse
`tools/pipeline`'s venv, which already has both).

1. In AutoCAD, same prep as before: `CV-LAYERS` → `CV-MERGE` → fix any
   gaps you can see by eye → `CV-HIDETEXT`.
2. Export the drawing to DXF: `DXFOUT`, keep the default filename (same
   base name as the DWG, so the script's log file lands next to the
   right `-cv-log.txt`).
3. Run the script on that DXF:
   ```
   python tools/cad-lisp/close_polygons.py path/to/export.dxf
   ```
   Options: `--gap-tolerance` (default 0.5 ft, same meaning as `CV-CLOSE`'s
   prompt), `--curve-tolerance` (default 0.05 ft, how finely arcs/bulges
   get flattened before tracing), `--out` (default
   `<dxf-name>-plot-draft.dxf`). It prints a one-line summary and appends
   the same kind of timestamped entry to `<drawing>-cv-log.txt` that the
   AutoLISP commands do.
4. Reimport the result into the original drawing: open the output DXF in
   its own AutoCAD window, select all (`Ctrl+A`), copy (`Ctrl+C`), switch
   to the original drawing, and paste at original coordinates
   (`PASTEORIG`). This brings in `CV-PLOT-DRAFT` (the traced regions) and
   `CV-FLAGS` (any endpoint it couldn't bridge, same as `CV-NEXT` used to
   cycle through) onto their layers.

`CV-PLOT-DRAFT` is a draft, not the answer. Review it against the plan
before doing anything with `COL-PLOT` — a region traced across a bridged
gap could be wrong in exactly the way `docs/cad-layer-standard.md` warns
about (D-118: judgement stays with you, the tool never repairs or guesses
on your behalf). Once you trust it, move the reviewed outlines onto
`COL-PLOT` yourself and continue with the rest of the per-colony procedure
(plot numbers → `COL-PLOT-NO`, `COL-SITE`, `COL-NORTH`, units check, DXF
export).

## Deriving a draft site boundary: derive_site.py

For a colony whose plan has no separately-drawn property boundary to trace by
hand, `derive_site.py` gives you a starting `COL-SITE` shape instead: it
unions every closed ring already on `COL-PLOT`, `COL-GARDEN`, `COL-AMENITY`,
`COL-WATER`, and `CV-PLOT-DRAFT` (so plots not yet promoted out of draft
still count), buffers the result outward by a safety margin (5 ft default —
this is insurance against the boundary touching a real feature's edge after
DXF export/reimport rounding, not an estimate of the true property line's
setback), and falls back to a convex hull if disconnected plot clusters are
still separate after buffering. Same contract as `close_polygons.py`: writes
to a scratch layer, `CV-SITE-DRAFT`, never to `COL-SITE` directly.

```
python tools/cad-lisp/derive_site.py path/to/export.dxf
python tools/cad-lisp/derive_site.py path/to/export.dxf --margin 10
```

Reimport the same way (`PASTEORIG`), then review `CV-SITE-DRAFT` against the
plan before tracing or moving anything onto `COL-SITE` — whether the real
boundary needs more margin than the outermost feature (a wall, an entrance
strip, an actual setback) is a judgement call this script cannot make for
you (D-118).

## Preflight checking: check_layers.py

Mirrors `pipeline/extract/dxf.py`'s conformance checks against the working
DXF directly, so `make ingest`'s rejections surface now instead of after a
real export: wrong entity type or unclosed ring on a `COL-*` layer,
`COL-SITE` not exactly 1 entity, a plot/feature polygon with zero or 2+
labels inside it, a label inside no polygon. Also reports how many entities
are still sitting on `CV-PLOT-DRAFT` un-promoted, and flags any
`COL-PLOT-NO` label that lands inside a draft polygon instead of `COL-PLOT`
-- usually a real, already-numbered plot whose outline never got promoted.

```
python tools/cad-lisp/check_layers.py path/to/working.dxf
```

Does **not** check north agreement (needs the colony config) or feature-label
keyword classification (`pipeline.matching.classify`, M12, built 2026-08-20) —
`COL-FEATURE-NO` labels are only checked for one-per-polygon here.

## Known limits (Phase 1)

- `close_polygons.py` reads `LINE`, `LWPOLYLINE` (bulges included), old-style
  `POLYLINE`, `ARC`, and `CIRCLE` — the same entity types `CV-MERGE` selects.
  `SPLINE`/`ELLIPSE` aren't handled; if a colony genuinely uses them for a
  plot boundary, say so and we'll add support rather than have the script
  silently drop that geometry.
- `CV-CLOSE` and `CV-NEXT` are retired (see above) but still present in
  `cv-tools.lsp` — don't delete them yet in case a very small colony DWG
  ever makes the old sweep-and-flag workflow worth reaching for again.
- Not yet built: `CV-LABELS` (plot-number cleanup), `CV-CHECK` (preflight
  validator mirroring the Python reader's checks), `CV-DIST` (unit check),
  `CV-EXPORT` (locked DXF save). Planned for Phase 2 once Phase 1 has been
  run against a real messy colony.
