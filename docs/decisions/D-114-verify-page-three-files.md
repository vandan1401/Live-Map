# D-114 — The verify page is three files, not one

**Status:** accepted

## Decision

`verify/index.html`, `verify/tracer.js`, `verify/tracer.css`. No build step — it opens from
`file://` and `make serve` exists only for CORS-free fetches.

## Reasoning

The original pitch was a single self-contained HTML file, which is genuinely appealing:
nothing to build, nothing to install, works anywhere. But the page grows into the most
complex piece of code in the repo — polygon editing, curved-row subdivision, corner
dragging, scale calibration, override writing — and as one file it would blow past the
250-line cap immediately, which would mean either exempting it from the cap or ignoring the
cap. Both are worse than three files.

Three files keep every benefit that mattered. There is still no build step, no bundler, and
no toolchain; you still just open it. The split is only in how the source is organised.

Keeping "no build step" as a hard rule matters because this tool has to still work in two
years when nobody remembers how to set it up.

## Rejected alternatives

- **Single HTML file** — as above.
- **A real frontend framework with a bundler** — better ergonomics for the tracing tools,
  and it adds a toolchain to a tool whose whole selling point is that it has none.

## Blast radius

Very low.
