# M7 — PWA install and offline reads

**Tier 1.** A bad service worker serves stale data indefinitely and is painful to
un-deploy — which is why this is Tier 1 despite looking like configuration.

## Goal

Installable on an iPhone home screen. Opens and shows the last-known colony state with no
network.

## Build

- Web app manifest, icons, `apple-mobile-web-app-capable`, and a splash screen.
- Service worker: app shell and colony SVGs cached aggressively; plot data cached in
  IndexedDB and revalidated on open.
- A one-time install instruction screen with a screenshot. iOS gives no install prompt and
  the flow only works in Safari, not Chrome — budget for hand-holding the first few users.
- Cached data must never render without its age. The freshness indicator from M5 is what
  makes offline safe rather than misleading.
- A cache wipe must be a non-event: worst case the app refetches on next open.
- Versioned cache names and a clear upgrade path. Shipping a service worker you cannot
  replace is the specific disaster this milestone risks.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Installs to an iPhone home screen and opens without browser chrome | Manual, real device |
| 2 | Airplane mode: colony renders from cache with a visible age | Manual, real device |
| 3 | Deploying a new version replaces the old service worker | Two successive builds, verified in DevTools |
| 4 | Clearing site data loses nothing permanently | Manual |
| 5 | Offline behaviour proved from a built, served bundle | Not a unit test. State this explicitly. |
