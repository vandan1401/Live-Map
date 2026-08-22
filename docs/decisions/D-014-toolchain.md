# D-014 — pnpm, Vite, Vitest, Wrangler

**Status:** amended by D-026 — pnpm/Vite/Vitest confirmed by use (every session since);
the deploy line's own rejected alternative (Cloudflare git integration) is what actually
shipped, 2026-08-22, once D-011 (this decision's stated condition for rejecting it) was
superseded by D-021. See D-026 for the reasoning.

## Decision

- Package manager: **pnpm**
- Build: **Vite** (react-ts)
- Test: **Vitest**
- Deploy: **`wrangler pages deploy dist`** to Cloudflare Pages

## Reasoning

Vite is the default for a React SPA of this size and gives a fast dev loop and a small
production bundle. Vitest shares Vite's config and transform pipeline, so there is no second
build to maintain. pnpm is faster and stricter about phantom dependencies than npm.

Cloudflare Pages is free at this traffic level — five users cannot approach any limit — with
global CDN and automatic HTTPS. Wrangler gives an explicit deploy command, which matters
because it is the string `guard.sh` blocks (D-011).

## Rejected alternatives

- **npm** — one fewer thing to install. Trivially reversible; the substitution appears in
  `settings.json`, two skill frontmatters, and `guard.sh`.
- **Next.js** — server rendering buys nothing for an authenticated internal tool that must
  work offline, and it complicates the static-hosting story.
- **Cloudflare Pages git integration instead of Wrangler** — deploys on push, which is
  convenient and removes the explicit command the guard hook depends on. Rejected for that
  reason while D-011 stands.

## Blast radius

Low. Confirm or correct before M1 creates `package.json`.
