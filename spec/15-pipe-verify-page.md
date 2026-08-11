# M15 — The verification page

**Tier 1** (`tools/pipeline/verify/`). It looks like a local UI; it **is** the human gate. If it shows
green for an unmatched plot, everything downstream is wrong and nobody finds out.

## Goal

Open one HTML file, see the colony, see instantly which plots the pipeline is unsure about,
fix them, and mark the colony verified.

## Build

- Three files — `index.html`, `tracer.js`, `tracer.css` — opened directly from `file://`.
  No build step, no server required beyond `make serve` for CORS-free fetches. Three files
  rather than one so the 250-line cap applies to real code (D-114).
- Load `tools/pipeline/out/<colony>/colony.svg` + `colony.json`. Colour by `confidence`: `contained` green,
  `nearest` amber, unmatched or duplicate red. Green plots need no attention — the whole
  point is that a clean colony shows almost nothing to do.
- A counter: "45 plots · 3 need attention". Clicking it cycles through only the red ones.
- Click a red plot, type its number, done. Right-click any polygon for a class menu:
  plot / garden / amenity / water / exclude. Misclassifications become five seconds each,
  and a typical colony has three or four.
- Arrow keys nudge a selected vertex. Undo with Ctrl+Z.
- **"Mark verified"** — enabled only when zero plots need attention. Writes
  `"verified": true` into the manifest. This is the button that turns a draft into a
  deliverable (D-108).

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Opens from `file://` with no build step | Manual |
| 2 | Demo fixture shows 45 green, 0 red | Manual, after `make ingest COLONY=demo` |
| 3 | Injecting an unmatched plot shows exactly one red and the counter reads 1 | Manual with a doctored manifest |
| 4 | Typing a number into a red plot turns it green and writes an override | Check `tools/pipeline/overrides/demo.json` |
| 5 | "Mark verified" is disabled while any plot is red | Manual |
| 6 | Reclassifying a polygon to `garden` moves it out of `plots` in the manifest | Manual |
| 7 | `/review` returns no findings above the correctness bar | Reviewer output |
