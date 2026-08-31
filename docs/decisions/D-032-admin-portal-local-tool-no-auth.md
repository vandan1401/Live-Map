# D-032 — Admin portal: local-only Node tool, no login layer, JSON-content-type CSRF gate

**Status:** accepted

## Decision

The admin portal (docs/plans/23.md, phase 3 of the multi-tenant SaaS conversion — create an
organization, create a user, reassign a user's org, generate/revoke a colony's public link)
is a small **local-only Node HTTP server** (`apps/map/admin-portal/server.ts`, plain
`node:http`, no new dependency) serving a plain HTML/JS/CSS frontend, in the same "owner-run,
never started by Claude, never deployed" posture `tools/pipeline/ui/` already established
(PROGRESS.md 2026-08-30) — extended here from Python/Flask to this app's own Node/TypeScript
ecosystem, since the tool needs `@supabase/supabase-js`'s Admin API the way
`scripts/create-user.ts` already does.

Three choices worth recording:

1. **No login/auth layer on the portal itself.** Its trust boundary is "whoever can run it
   locally already holds `SUPABASE_SERVICE_ROLE_KEY` in `.env`, which is full admin access
   to that Supabase project regardless of this tool." A password gate would be theater over
   a boundary the service-role key already draws.
2. **Every mutating route requires `Content-Type: application/json`**, rejecting anything
   else before touching Supabase — a cheap, real CSRF mitigation. Unlike
   `tools/pipeline/ui/`'s file-processing actions, this tool creates accounts and reassigns
   organization membership, a higher blast radius than that precedent's own posture covers.
3. **`.claude/hooks/guard.sh` blocks every way to start it** — the `make admin-portal`
   target, `pnpm`/`npm run admin-portal` (with or without `-C`/`--dir=` routing around a
   `cd`), and a direct `tsx admin-portal/server.ts` invocation — so Claude cannot start this
   server even to "just check" something, matching the stated CLAUDE.md rule ("long-running
   servers are mine") rather than leaving an unenforced gap the way `make ui`'s guard rule
   briefly did before PROGRESS.md's 2026-08-30 entry closed it.

## Reasoning

Reusing the local-tool shape `tools/pipeline/ui/` already established (rather than, say,
adding an authenticated screen inside `apps/map`'s own shipped bundle) keeps this tool
outside the deployed app's attack surface entirely — `apps/map/src/` never imports
`admin-portal/`, so `pnpm build`'s Vite bundle provably never includes it (confirmed by
grepping `dist/` after a build, not assumed). This was the owner's own explicit decision
back in docs/plans/21.md's clarification session ("a separate small tool, not a screen
inside `apps/map`'s shipped bundle").

Skipping a login layer is a direct consequence of the trust model every existing admin
script (`create-user.ts`, `generate-public-link.ts`, `import-seed.ts`) already has: local
shell access plus the service-role key already grants everything this tool could gate
further. Adding a password would not shrink the real attack surface, only add a second
credential to keep in sync with the first.

The content-type CSRF check is cheap (one header comparison) and closes a real gap a
same-origin-only assumption would otherwise leave open — a cross-site HTML form can `POST`
to any `127.0.0.1` port without a CORS preflight (a "simple request"), and without this
check such a form could silently create an account or invalidate a colony's public link
just by a family member visiting an unrelated page with the portal running in another tab.
`/review` (2026-08-31) found the original implementation only applied this check inside the
JSON-body-parsing helper, which the two body-less public-link routes never called — fixed
by hoisting the check to run for every non-`GET` request before any route dispatches.

## Rejected alternatives

- **A login screen on the portal** — rejected; see "no login layer" above. The service-role
  key is already the real gate.
- **Express or another web framework** — rejected in favor of plain `node:http`, matching
  this repo's existing "Node's built-in, no new dependency" posture
  (`scripts/generate-public-link.ts`'s own `crypto.randomUUID()` precedent) for a handful of
  routes that don't need a framework's routing/middleware machinery.
- **A screen inside `apps/map`'s own authenticated UI** — rejected; the owner explicitly
  ruled this out in docs/plans/21.md's clarification session. It would also put
  service-role-level actions behind the same session boundary as an ordinary family-member
  login, which is the wrong trust boundary for account/org creation.

## Scope

`apps/map/admin-portal/{actions,server}.ts`, `apps/map/admin-portal/static/*`,
`.claude/hooks/guard.sh`, `CLAUDE.md`'s "Never run" list, root `Makefile`'s `admin-portal`
target.
