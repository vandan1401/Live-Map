---
name: review-sw-asset-prune
description: Recurring check — apps/map's hand-written service worker prunes any cached /assets/* entry that index.html does not reference, so a runtime-fetched hashed asset (image, font, lazy chunk) is evicted on every navigation and is never available offline.
metadata:
  type: feedback
---

Whenever a diff adds a new `import x from "../assets/…"` (or any asset Vite emits to
`dist/assets/` but that `index.html` does not link), check it against
`apps/map/public/sw.js`'s `refreshShellCache()`.

**Why:** that function derives the allowed cache set by regexing `/assets/[A-Za-z0-9._-]+`
out of **index.html only** (`sw.js:11-13`), then deletes every cached `/assets/*` entry not
in that list (`sw.js:25-29`). It runs on install *and on every successful navigation*
(`sw.js:72`). The `fetch` handler happily caches any same-origin `/assets/*` GET
(`sw.js:81-95`), so the asset gets cached on first use and pruned again on the next page
load — a permanent re-download loop, and nothing in the cache when offline.

This lay dormant for a year because every asset in the app was either linked from
index.html (the JS/CSS bundle) or small enough for Vite to inline as a data URI —
`assets/textures/grass-satellite.jpg` is ~2.4KB and never appears in `dist/assets/` at all.
2026-09-08 (plan 28): `assets/backdrops/bharatkshetra.jpg` is 431KB, so Vite emits it as a
real file; `dist/index.html` references only `index-*.css` and `index-*.js`. The plan's own
Failure Modes section reasons at length about "a failed/blocked backdrop image fetch on a
rural-India phone" while the app's own service worker guarantees that fetch repeats on
every navigation.

**How to apply:** run `pnpm build` in `apps/map`, then
`grep -o "/assets/[A-Za-z0-9._-]*" dist/index.html` and compare against `ls dist/assets/`.
Anything in the second list and not the first is affected. Note it, don't fix it inline:
`apps/map/public/sw.js` is Tier 1 (CLAUDE.md's risk table), so the fix needs its own plan —
the finding belongs in `PROGRESS.md` → `## Deferred`. Related: [[review-non-ts-call-sites]]
(same family: the thing that breaks is outside TypeScript's reach, so typecheck/lint/tests
are all green).
