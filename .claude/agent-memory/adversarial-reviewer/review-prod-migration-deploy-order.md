---
name: review-prod-migration-deploy-order
description: The local DB is always ahead of production here (owner applies migrations by hand), and fetchPublicColony/RPC results are unchecked `as` casts — so any RPC return-shape change plus a UI that reads the new fields renders blanks in production until the owner runs the migration.
metadata:
  type: feedback
---

When a diff adds fields to an existing RPC's return shape **and** a UI that reads them,
check for the PROGRESS.md `## Deferred` entry naming the migration file as pending on the
production Supabase project. Its absence is a finding, not a formality.

**Why:** production migrations here are applied by the owner by hand, days late
(PROGRESS.md's own log: the zoom-ref migration sat unapplied for weeks; M16/M17 were caught
up in one batch on 2026-08-31). Every RPC result crosses into TypeScript through an
unchecked cast — `apps/map/src/lib/db/colonies.ts`'s `return data as PublicColonyResult`
— so a deployed UI reading fields the deployed RPC does not return gets `undefined`, not an
error. On plan 25 that meant a public visitor tapping a plot would see a panel with a blank
heading and " ft / ft / sq ft". `tsc` cannot see this: the type says the fields are
non-optional strings/numbers. Same family as [[review-optimistic-defaults]].

**Recurrence:** 2026-09-12 (plan 29) — the same gap again, and it had already been a `/review`
finding once (PROGRESS.md's own log: "**/review found 5 issues** … (1) real gap — no
`## Deferred` entry"). Both new migrations (`20260912000000_colony_backdrop_storage.sql`,
`20260912010000_public_link_backdrop.sql`) appear only in `## Current`/`## Log` prose; the
`## Deferred` section, which carries a dedicated entry per pending migration (see the M20
zoom-ref one, still open there), was not touched. `## Current` gets rewritten by the next
session's work; `## Deferred` is the list that survives.

**Recurrence, 3rd: 2026-09-12 (plan 30)** — a new migration
(`20260912020000_colony_backdrop_authenticated_write.sql`, RLS + column grants, not an RPC
shape change) with no `## Deferred` entry and no PROGRESS.md change at all, one session after
the plan-29 finding above. **The failure mode generalises past RPC casts:** here the frontend
ships a per-row "Backdrop" button whose every save, if deployed before the migration, fails
with the diff's own new message — `colony "<id>" not found, or you do not have access to it`
— which blames the colony for a deploy-order problem. **So: for *any* new migration, check
`## Deferred`; and ask what the app's new error text asserts when the migration is missing
([[review-error-vs-empty-conflation]]).**

**Recurrence, 4th: 2026-09-18 (plan 35)** — `20260918000000_colony_upload_auto_public_link.sql`
(new body for `create_colony_from_manifest` + a one-time backfill `update`). `PROGRESS.md`'s
`## Current` says "Not yet done: … the owner's own production apply via the Dashboard SQL
Editor"; `## Deferred` (line 3398) was not touched. Note what the missing entry costs *here*:
the migration's `comment on function create_colony_from_manifest is …` has no argument list,
so it aborts with "function name is not unique" if production still carries an older overload
— the kind of one-line pre-check (`select proname, pronargs from pg_proc where proname =
'create_colony_from_manifest'`) that the M16/M17 Deferred entries spell out and a `## Current`
paragraph never does.

**How to apply:** for any migration touching a function the app already calls in
production, (1) grep PROGRESS.md for the new migration's filename — if it is absent from
`## Deferred`, that is the finding, with "add the entry in the same shape as the M16/M17
ones" as the fix; (2) ask what the UI renders when the field is `undefined`, because there
is no runtime validation layer between the RPC and the component. Local green proves
nothing about this: `supabase db reset` always leaves the local DB fully migrated
([[review-migration-empty-db-blind-spot]]).

**6th, 2026-10-27 — plan 40 `20261027000000_colony_statuses.sql` (statuses worktree).** The
deploy-order rule and three "**Deferred:**" items were written into `## Current` prose again;
`## Deferred` (line 3486) untouched. New angle: plan said "old app + new DB must work" but
never covered **old app + new *data***. A PWA tab still on the old bundle reads a plot with a
status key outside its closed table and throws (`PLOT_TRANSITIONS[from]` undefined). When a
migration opens a closed vocabulary, ask what an un-reloaded client does with the new values.

**5th, 2026-10-08 — plan 36 `20261008000000_admin_audit_log.sql` (selfhost worktree).** No
`## Deferred` / PROGRESS entry, and the code is *fail-closed* on it: the admin portal's login
refuses every sign-in when the audit insert fails, so the SaaS owner is locked out of the
portal until the table exists in prod **and** `grant-super-admin` has been run there. A
fail-closed dependency on a new table makes deploy order an availability issue, not a
rendering one — call it out as such.
