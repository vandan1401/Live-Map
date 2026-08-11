# D-003 — Supabase Auth magic links, not Cloudflare Access

**Status:** accepted

## Decision

Authentication is Supabase Auth with email magic links, six addresses allowlisted.

## Reasoning

Cloudflare Access was the better answer while the app was a static page reading a published
sheet — it gates the whole site for free at up to 50 users and needs no auth code. That
stopped working once row-level security entered the picture, because RLS needs to know
*which* user is asking, and Access only proves that *someone* authorised got through.

Magic links also remove the password database and the reset flow entirely.

## Rejected alternatives

- **Cloudflare Access** — free, zero auth code, and offboarding is deleting a line from a
  list. Rejected because the database cannot see the identity, so per-user attribution and
  RLS would have to be reimplemented on top of it anyway.
- **Passwords** — a reset flow to build and a credential store to protect, for five users.
- **Google Workspace SSO** — genuinely better if the family has Workspace, since removing
  someone from Workspace revokes app access in one step. Worth revisiting at M8 if it turns
  out they do.

## Blast radius

Contained to M8 and `src/lib/auth/`. Revisitable.
