# D-026 — Cloudflare deploy via Git integration, not the wrangler CLI

**Status:** accepted

## Decision

The live deploy (`https://live-map.moonatvandan.workers.dev`) is Cloudflare's Git-connected
build/deploy — Cloudflare rebuilds and redeploys automatically on every push to
`master` on `github.com/vandan1401/Live-Map`. This is the opposite of what D-014 named
(`wrangler pages deploy dist`, an explicit local CLI command).

## Reasoning

D-014 rejected "Cloudflare Pages git integration instead of Wrangler" for one stated
reason: "Rejected for that reason while D-011 stands" — D-011 blocked public deployment
entirely until M8 shipped auth. D-011 is superseded by D-021 (M8 shipped, block lifted).
With that condition gone, D-014's own rejected-alternative section no longer has a reason
behind it.

Once the owner had a real GitHub remote for the first time this session
(`github.com/vandan1401/Live-Map`, previously no remote existed at all), Git integration
became strictly lower-friction than the CLI path: no `wrangler login` needed on the
owner's machine ever, and every future push auto-deploys with no explicit deploy command
for anyone to run — relevant since `CLAUDE.md` reserves `wrangler pages deploy` for the
owner, not Claude.

Separately, and not something either D-014 or this decision anticipated: as of this
session, Cloudflare's dashboard no longer offers the classic, separate "Pages" product at
all. A Git-connected project is created as a unified "Workers" project regardless of
which deploy method you'd have chosen — it deploys via `wrangler deploy` reading an
`[assets]` block in `wrangler.toml`, not `wrangler pages deploy` reading
`pages_build_output_dir`. `apps/map/wrangler.toml` reflects this (name/`[assets]`), found
live after the first real deploy attempt failed with "Missing entry-point to Worker
script or to assets directory."

## Rejected alternatives

- **Keep the wrangler CLI path D-014 specified** — still technically available
  (`wrangler login` once, `wrangler pages deploy dist` after each build), and
  `wrangler.toml` still supports it. Rejected because it adds a manual step to every
  future deploy for no benefit now that Git integration is equally available and the
  D-011 condition that ruled it out is gone.

## Blast radius

Low. `apps/map/wrangler.toml`'s shape changed (`[assets]`, project `name` matching the
Cloudflare-assigned project name `live-map`, not `pages_build_output_dir`). Production
env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) now live in Cloudflare's
dashboard (Production scope) rather than being passed to a local CLI invocation — the
`service_role` key is never given to Cloudflare, it stays local-only (`create-user.ts`
runs by hand against the hosted project, not as part of any deploy).
