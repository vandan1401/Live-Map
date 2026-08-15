# D-019 — Username/password via a synthetic per-user email, not magic links

**Status:** accepted — supersedes D-003's mechanism

## Decision

Family members sign in with a username and password, not an email magic link. Every
account still has a real Supabase Auth email under the hood — `{username}@colony.local`,
generated deterministically and never shown to the user — so Supabase Auth's session/
JWT/`auth.uid()`/RLS machinery keeps working exactly as documented, unmodified. There is
no public self-registration (`enable_signup = false`); an admin-created `auth.users` row,
via `scripts/create-user.ts`, **is** the allowlist. No separate roster table.

## Reasoning

Explicit, deliberate override by the user during `docs/plans/09.md`'s planning session:
"we do auth a little different — usernames and passwords no email needed." The family
does not use email addresses for this app's login and does not want to start.

D-003 rejected passwords specifically because of "a reset flow to build and a credential
store to protect, for five users" — that tradeoff is accepted here on direct instruction,
not re-litigated. There is still no self-service password reset; a forgotten password is
fixed by an admin re-running the equivalent of `scripts/create-user.ts` against the
existing account (`auth.admin.updateUserById`), the same non-goal `docs/plans/09.md`
records.

## Rejected alternatives

- **Magic links (D-003's original choice)** — rejected by explicit user instruction, not
  a technical failure of the approach.
- **A real per-user email address** — would require the family to actually have and check
  email for this app, which the user's instruction ruled out.
- **A fully custom auth system** (own hashed-password table, own session tokens) —
  considered and rejected in favour of the synthetic-email technique: it would mean
  reimplementing session/JWT/RLS integration from scratch for no benefit over keeping
  Supabase Auth and only changing what the user types.

## Blast radius

Contained to `apps/map/src/lib/auth/`, `apps/map/supabase/config.toml`'s `[auth]` block,
and `scripts/create-user.ts`. The rest of the stack (RLS policies, `auth.uid()`/
`auth.jwt()` usage inside `apply_plot_transition()`, session handling in `App.tsx`) is
unaffected by *how* a session was obtained — it only ever consumes the resulting session,
matching D-016's own blast-radius note about the source of the attribution string being
swappable with no schema change.
