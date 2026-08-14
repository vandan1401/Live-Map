---
name: review-unstyled-new-components
description: Recurring check — new overlay/screen components in apps/map ship className strings that have no matching CSS rule and no stylesheet import, so the screen renders as unstyled default HTML.
metadata:
  type: feedback
---

For every new component in `apps/map/src/`, grep each `className` literal against
`apps/map/src/styles/*.css` **and** confirm the stylesheet is `@import`ed in
`apps/map/src/index.css`. Tailwind utility classes are fine; bespoke BEM-ish names
(`foo-overlay`, `foo-card`) are the risk.

**Why:** `apps/map` uses Tailwind *plus* one hand-written stylesheet per feature overlay
(`name-prompt.css`, `colony-picker.css`, `plot-detail-sheet.css`, …), each explicitly
imported in `index.css`. Nothing in the toolchain fails when a class has no rule — typecheck,
lint, tests and build all pass, and Claude has no browser, so an entirely unstyled screen
ships green. 2026-08-14 (plan 07, M7): `InstallInstructions.tsx` used
`install-instructions-overlay` / `-card` / `-dismiss`; no such rules existed anywhere and no
new stylesheet was added. That component is the *first screen every user sees* on first open.

**How to apply:** one grep per new component, every review. Related:
[[review-comment-asserts-unimplemented]] (same family: everything that could catch it is
green, so only reading catches it).
