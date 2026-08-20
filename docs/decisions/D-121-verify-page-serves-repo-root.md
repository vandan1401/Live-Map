# D-121 — Verify page's `make serve` targets serve the repo root, not just `verify/`

**Status:** accepted
**Date:** 2026-08-21
**Range:** tools/pipeline (D-1xx) — implements spec/14/M14, extends D-114

## Context

D-114 fixed the verify page's shape (three files, no build step) but not what document
root `make serve` exposes. Both `serve` Makefile targets (root and
`tools/pipeline/Makefile`) predated M14 and served only the `verify/` subdirectory
(`python -m http.server 8080 --directory verify` / `cd verify && python -m http.server`).

Building the page for real exposed the problem: `verify/index.html` needs to `fetch()`
`../out/<colony>/colony.{svg,json}` and `../colonies/<id>.json`, and to `<link>`/`fetch()`
the app's own `apps/map/src/styles/*.css` and `apps/map/src/assets/textures/*.jpg` — all of
which live *outside* `verify/`. Python's `http.server` clamps every request path to its
own document root (it strips `..` segments rather than resolving them upward), so none of
that is reachable no matter what relative URL the page uses, as long as the server root
stays `verify/`.

## Decision

Repoint both `serve` targets to serve the repo root:
- Root `Makefile`: `python3 -m http.server 8080` (already running from the repo root).
- `tools/pipeline/Makefile`: `python3 -m http.server 8080 --directory ../..`.

The page is then opened at `http://localhost:8080/tools/pipeline/verify/index.html`, and
every fetch/link inside it is a plain relative path (`../out/...`, `../colonies/...`,
`../../../apps/map/src/...`) that resolves correctly.

## Reasoning

The alternative that keeps the server root at `verify/` — symlinking `out/`, `colonies/`,
and `apps/map/` into `verify/` — was rejected: symlinks need `core.symlinks`/Developer
Mode on Windows (this project's primary dev machine), so they'd silently check out as
broken text files for exactly the people this tool is for. Serving from the repo root is
one Makefile line, no new file-system state, and matches what a human would reach for
first (`python -m http.server` from the top).

The cost is scope: the local server now also serves `apps/map/src/**`, `contract/**`,
`.git/`, etc. This is a `localhost`-only dev convenience the owner runs by hand
(CLAUDE.md: "I run that, not Claude"), same trust boundary the CORS-free-fetch server
already had — D-114 already accepted "no build step, no bundler" as more important than a
locked-down document root for this specific tool.

## Rejected alternatives

- **Symlink `out/`/`colonies/`/`apps/map` into `verify/`, keep server root at `verify/`**
  — as above, Windows symlink portability makes this actively worse than the status quo
  for this repo's actual dev environment.
- **Copy the needed CSS/JS/asset files into `verify/` at export time** — a build step,
  which is the one thing D-114 rules out; also creates a second copy of
  `colony-theme.css` that can silently drift from the real one, defeating the entire
  point of "renders exactly what the app will."
- **Give `verify.js` its own duplicate texture-pattern colours instead of the app's
  real CSS** — cheaper, but then a colour mismatch between the verify page and the app
  becomes invisible to this exact tool, which is the two failure modes (Y-flip, wrong
  scale) it exists to catch.

## Blast radius

Low — only affects local `make serve` invocations, always `localhost`-bound, never
deployed (`wrangler pages deploy` is separately forbidden to Claude, per CLAUDE.md).
