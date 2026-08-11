# D-001 — PWA on Cloudflare Pages, not a native iOS app

**Status:** accepted

## Decision

Ship as a Progressive Web App installed to the iPhone home screen via Safari's
Add to Home Screen. No App Store, no TestFlight, no native wrapper.

## Reasoning

The blocker was never building an iOS app — it was distributing one to five family members
without an App Store listing. Every distribution route is bad at this scale, and a PWA
sidesteps all of them: send a link, they add it to the home screen, done. Modern Safari
supports service workers, so the original worry about a website not caching is outdated.

## Rejected alternatives

- **App Store** — $99/yr, review process, and a public listing for a private internal tool.
- **TestFlight** — free, but builds expire every 90 days and still needs the $99/yr
  developer account. Re-shipping quarterly forever for five users is absurd.
- **Ad-hoc distribution** — $99/yr, capped at 100 devices, and each device UDID has to be
  registered by hand.
- **Apple Enterprise Program** — $299/yr and Apple only grants it to large organisations
  for genuine internal employee apps. A family real-estate business will not qualify.

## Blast radius

High but well understood. Reversing this means rebuilding the client. Two known costs
accepted up front: installation only works from Safari, not Chrome on iOS, and there is no
install prompt — M7 budgets a one-time instruction screen and hand-holding for the first
few users.
