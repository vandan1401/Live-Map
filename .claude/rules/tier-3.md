---
paths:
  - "apps/map/src/components/**/*.tsx"
  - "apps/map/src/styles/**/*.css"
  - "apps/map/index.html"
  - "apps/map/vite.config.ts"
  - "apps/map/tailwind.config.ts"
  - "tools/pipeline/pipeline/cli/**/*.py"
  - "tools/pipeline/verify/**/*"
  - "tools/pipeline/Makefile"
  - "tools/pipeline/pyproject.toml"
---

# Tier 3 — UI, CLI, styling, config

## apps/map

Test gate only. No plan, no review. Move fast here.

### The theme is the contract

Every colour is a CSS variable in `apps/map/src/styles/colony-theme.css`. Changing a status colour
means editing one variable, and it changes for every colony at once. That is the entire
payoff of D-004 — do not undo it by hardcoding a colour in a component.

Status colours must stay saturated while roads, greens, and ground stay muted. The map's
one job is making status readable at a glance; if the garden competes with "available",
the design has failed regardless of how nice it looks on a desktop monitor.

Readability in direct sunlight on a phone at a site visit is the real test, not a
screenshot.

### Rendering constraints

These are performance rules, not preferences. They were chosen because mobile Safari on an
older iPhone is the target device.

- **No SVG filters.** Blur and drop-shadow force a repaint on every zoom step. Use solid
  offset shapes for shadows.
- Static decoration gets `pointer-events: none`. Only `.plot` is hit-tested.
- Hide tree canopies and plot labels below the zoom threshold — better looking and
  measurably faster.
- Selected state uses stroke and scale, never fill. Fill belongs to status.

### Copy

Sentence case. The users are family members, not customers — plain Indian-English business
language, no product-marketing tone. "Booked by Vikas, 2:40pm" beats "Status successfully
updated".

The map always shows "Indicative layout — not to scale".

## tools/pipeline

Test gate only. No plan, no review. Move fast here.

### The CLI is a thin shell

Argument parsing and printing. No geometry, no matching, no file-format handling. If a
function in `tools/pipeline/pipeline/cli/` is doing real work, it belongs a layer down where it can be
tested without a subprocess.

Errors reach the user as a sentence, not a traceback. The most common failure will be a
rasterised PDF from "Microsoft Print to PDF", and the right response is a message saying
exactly that and naming the correct plotter — not a stack trace about missing drawings.

### Verify page styling

The pass/fail distinction is the only thing on screen that matters. Everything else is
quiet. (There is no amber tier since D-118 — nothing is held at partial confidence; a colony
either exports clean or names the entity that blocked it.)

Red must be unmistakable at a glance across a full colony — this is scanned, not read. Do
not use a red that a colourblind user cannot separate from green; pair the colour with a
shape or an outline weight so it never depends on hue alone.

### Makefile

Targets are the interface. Every repeated command gets one, named conventionally, so it is
found by name and never by searching. Keep them short enough to read.
