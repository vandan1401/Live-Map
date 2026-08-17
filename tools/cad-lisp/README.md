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
4. **`CV-CLOSE`** — the main one. Prompts for two numbers:
   - **Gap tolerance** (default 0.5 drawing units = 0.5 ft, since colonies
     are drawn at 1 unit = 1 ft): endpoints closer than this get bridged
     automatically with a short line. Anything wider is left alone.
   - **Approx. smallest plot dimension** (default 20): sets the density of
     the internal scan grid used to trace closed regions. Smaller plots
     need a smaller number here, at the cost of a slower scan.

   It then: bridges small gaps on `CV-MERGED`, flags unresolved open
   endpoints as circles on `CV-FLAGS`, temporarily isolates `CV-MERGED`
   (so dimension lines etc. don't interfere with tracing), sweeps the area
   tracing every closed region it finds onto `CV-PLOT-DRAFT`, dedupes
   overlapping results, and restores your layer visibility.
5. **`CV-NEXT`** — zooms to and highlights each flagged gap on `CV-FLAGS`
   in turn, so you're not hunting for them by eye. Run it repeatedly to
   cycle through all flags.

Every command prints a one-line summary and appends a timestamped entry to
`<drawing-name>-cv-log.txt` next to the DWG — a paper trail of what ran and
what got auto-bridged, in case a plot boundary is ever questioned later.

Each command wraps its edits in one `UNDO` group, so a single `U` reverses
the whole thing.

## After CV-CLOSE

`CV-PLOT-DRAFT` is a draft, not the answer. Review it against the plan
before doing anything with `COL-PLOT` — a region CV-CLOSE traced across a
bridged gap could be wrong in exactly the way `docs/cad-layer-standard.md`
warns about (D-118: judgement stays in AutoCAD, the tool never repairs or
guesses on your behalf). Once you trust it, move the reviewed outlines onto
`COL-PLOT` yourself and continue with the rest of the per-colony procedure
(plot numbers → `COL-PLOT-NO`, `COL-SITE`, `COL-NORTH`, units check, DXF
export).

## Known limits (Phase 1)

- The gap-closer only looks at `LINE` and open `LWPOLYLINE` endpoints —
  arcs/splines/old-style `POLYLINE` aren't included in that pass (though
  `CV-CLOSE`'s boundary trace still handles arcs fine once geometry is
  closed).
- `-BOUNDARY`'s behaviour on a point that lands outside any closed area is
  assumed to print a message and continue, not open a blocking dialog. If
  `CV-CLOSE` ever appears to hang, press `Esc` and tell me — we'll adjust it
  against your actual AutoCAD version.
- Not yet built: `CV-LABELS` (plot-number cleanup), `CV-CHECK` (preflight
  validator mirroring the Python reader's checks), `CV-DIST` (unit check),
  `CV-EXPORT` (locked DXF save). Planned for Phase 2 once Phase 1 has been
  run against a real messy colony.
