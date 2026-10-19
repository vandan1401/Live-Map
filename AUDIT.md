# AUDIT — private self-hosted instance (Part B, read-only)

Date: 2026-10-08. Scope: `apps/map`. Method: file reads and greps only. No cloud access, no commands against Supabase.
Items marked **UNVERIFIED** were not checked yet.

## 1. Framework and hosting
- Vite 8 + React 19 SPA/PWA (pnpm). Leaflet canvas map. There is no Next.js.
- Deployed today as a **Cloudflare Worker with static assets** (`wrangler.toml`, name `live-map`, `assets.directory = ./dist`), built via Cloudflare's Git integration.
- `worker/index.ts` is the only dynamic route. It renders per-colony WhatsApp/OG link previews server-side by calling the `get_public_colony()` RPC. It uses `@resvg/resvg-wasm` (a CompiledWasm rule), the Cloudflare Cache API and the `nodejs_compat` flag. It reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` as **runtime Worker secrets**.
- **Frontend env is build time**: `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, read only in `src/lib/db/browserClient.ts`. One image for every deployment therefore needs a runtime `/config.js` (C2).
- Consequence for Docker: nginx cannot serve this app alone. The OG-preview Worker must run in the self-hosted stack too. Otherwise shared colony links lose their previews, which matters because the links circulate on WhatsApp.
  - Option 1: run the Worker in `workerd` (Cloudflare's open-source runtime) in a container.
  - Option 2: port it to a small Node service.
  - **Needs your decision in Part C.**

## 2. Supabase features used
| Feature | Use |
|---|---|
| Auth | Username/password (synthetic email). `app_metadata.org_id` and `display_name`. No SMTP needed: `enable_confirmations=false`, `enable_signup=false` in `config.toml`. |
| Realtime | `plots` table only, via `alter publication supabase_realtime add table plots` (migration `20260815000000`). |
| Storage | One bucket, `colony-backdrops` (public read). `storage.objects` policies scoped by org, in migrations `20260912*` and `20260913*`. |
| RPC | `security definer`: `apply_plot_transition`, `bulk_set_initial_plot_data`, `create_colony_from_manifest`, and the anon-callable `get_public_colony(token)`. |
| Triggers | `plot_history` append-only (update/delete rejected, truncate revoked). |
| Edge Functions | **None.** There is no `supabase/functions`. |
| pg_cron / webhooks | None found. |

## 3. Is the schema fully in `supabase/migrations`?
- 18 migrations, from `m2_schema` onward. Tables, RLS, functions, triggers, the Realtime publication and the storage policies are all in git.
- **UNVERIFIED against cloud.** A diff needs `supabase db diff --linked` or a read-only `pg_dump --schema-only` of the cloud project. That touches the production project, so it needs your OK first.
- Local rebuild (`supabase db reset`) is allowed by `CLAUDE.md`. I'll run it in C1 to prove the migrations rebuild from scratch.
- `config.toml` carries only local-dev values (`site_url = http://localhost:5173`). The self-host Auth URLs need setting in the self-host `.env`.

## 4. Hardcoded config
- No Supabase project ref, `supabase.co` URL, key or product domain in `src/`, `worker/`, `admin-portal/` or `scripts/`. Only test fixtures contain `example.*` URLs.
- `wrangler.toml` has the project name `live-map`. It is SaaS-only and doesn't affect self-host.
- Bucket name `colony-backdrops` and the PWA service-worker cache name are constants. Both are fine.
- Gitignore covers `.env`, `.env.*` and `.env copy*`. **UNVERIFIED** that no secret is already committed (needs a git-history scan).

## 5. Tenant model
- `organizations` table. `org_id uuid not null` is denormalized onto `colonies`, `plots` and `plot_history`.
- RLS is select-only, authenticated **and** own-org. All writes go through `security definer` RPCs, which re-check the org inside the function.
- The org comes from the JWT's `app_metadata.org_id`.
- Unclear or worth a second look:
  - `get_public_colony` (anon, token-gated; intentional).
  - The backdrop column-level update grant on `colonies`.
  - Whether `organizations` has any write path other than the admin portal.
- Self-host fit is good: the DB would hold one org, and RLS already scopes by it.
- The brief's `SELFHOSTED_ORG_ID` UI filter is mostly redundant.

## 6. Super-admin today
- There is **no `super_admin` role and no hosted super-admin page.** The "admin portal" is `admin-portal/server.ts`, a plain `node:http` server owner-run on `127.0.0.1:5002`. It has no login at all; its safety is that only a machine holding the service-role key in `.env` can run it.
- It creates users with `auth.admin.createUser` (confirmed email, `app_metadata {org_id, display_name}`). It lists users with `listUsers`, reassigns org with `updateUserById`, and manages orgs, public links and backdrops.
- **There is no password reset, no deactivate/remove and no audit log.** C4 adds them.
- Service role key use: `admin-portal/*`, `scripts/{create-user,generate-public-link,import-seed}.ts` and test helpers. It is never `VITE_`-prefixed and `src/` has no reference to it.
  - **UNVERIFIED** until I grep a fresh `dist/` bundle (a C4 task).
- Implication for the brief: it says the SaaS has a super-admin page, but here the SaaS-side equivalent is this local tool. C4 becomes "harden and containerize the existing portal behind Tailscale plus a real auth check", not "split an existing hosted page".
  - The portal must also keep working in SaaS mode.
  - It needs a `super_admin` marker that doesn't exist yet. The proposal is an `app_metadata.role` claim, set by hand for you only.

## 7. Third-party services
- No SMTP (username auth), no SMS, no payments found.
- **UNVERIFIED:** analytics, error tracking and external fonts/CDN. I haven't grepped for them yet. I'll check in C3.
- The Worker's OG-image path runs on Cloudflare. It needs a self-host replacement (see section 1).

## 8. Repo-policy conflicts to resolve
- `CLAUDE.md` invariant 8 says "no auth until M8; don't deploy to a public URL". Auth and org RLS have since shipped (docs/plans/09 and 21).
  - The invariant text looks stale.
  - The guard hook may still block deploy commands. I'll check `.claude/hooks/guard.sh` before Part D.
  - It's your call whether to update the invariant.
- Tier 1 paths (migrations, auth, sync) need `/plan` then `/review`. C1 and C4 touch them. Treat C1, C3 and C4 as Tier 1 work.
- The working tree has uncommitted changes (Worker, share link). Part C must branch from a clean commit, so those need committing or stashing first.
- The project already has a 427 KB `PROGRESS.md`. Self-host progress goes in `docs/selfhost/PROGRESS.md` instead, so the two don't collide.

## 9. Proposed adjustments to Parts C–E
1. **C1:** run `supabase db reset` locally. A cloud diff is optional and needs your OK.
2. **C2:** add a runtime `/config.js`. The Worker keeps its secrets for SaaS, and the self-host Worker or port gets its env from the compose file.
3. **C3:** `DEPLOYMENT_MODE` mostly hides the upload/org features that don't apply. Signup is already off, there is no billing, and there are no cross-tenant views in the app.
4. **C4:** rework as above. Add the `admin_audit_log` table, the password reset and deactivate actions, and the JWT + `role` check. Bind it to the Tailscale interface.
5. **C5:** add an OG-preview service to the compose stack.
6. **Part A:** the install needs the client's router, since you have none. Do the USB install at their office, or borrow a router.
7. **Domain:** needs the client's domain on Cloudflare DNS, or an alternative to Cloudflare Tunnel for hostnames. Decide before Part D.

## Questions before Part C
1. OG-preview service in self-host: `workerd` container (closest to today) or a Node port?
2. May I run a read-only schema diff against the production cloud project? Or skip it and trust the migrations plus the local rebuild?
3. The `super_admin` marker: `app_metadata.role = 'super_admin'` on your own user only. OK?
4. Commit or stash the current uncommitted work so Part C can branch cleanly?
5. Should I update CLAUDE.md invariant 8, given that auth has shipped?
