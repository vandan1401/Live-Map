# D-040: Home-screen heading is read from `organizations.name` at sign-in, not `presentation.json`'s single `default.homeHeading`

**Status:** accepted
**Date:** 2026-09-10
**Context:** Owner ask: every group's post-login home screen showed the same hardcoded
"Nimantran Group Colonies" heading regardless of which org signed in. Renaming an org via
the admin portal (`organizations.name`, docs/plans/23.md phase 3) had no visible effect
anywhere in the app — D-034's `presentation.json` mechanism only ever had one `default`
block, deliberately, because at the time it was written (2026-09-03) "there is currently
one org" (D-034's own non-goal). Multi-tenant data isolation (D-030, M16) has since
shipped, so that premise no longer holds.

## Decision

`fetchMyOrganization(client)` (`apps/map/src/lib/db/organizations.ts`) does a plain
`select("*")` against `organizations` — the existing `organizations_authenticated_select`
RLS policy (M16) already restricts this to the caller's own org row, so no new policy or
query parameter is needed. `useOrgName(client, session)` (`apps/map/src/lib/colony/
useOrgName.ts`) owns the fetch and resulting state; `App.tsx` passes the result to
`ColonyPicker` as a new required `orgName: string | null` prop. `ColonyPicker` uses
`orgName ?? presentation.json's default.homeHeading` as its heading — the config value
becomes a fallback for the brief loading window before the fetch resolves, or if it fails,
rather than the primary source of truth.

## Why

**The org is already the tenant boundary; the heading should follow it.** `colonies`,
`plots`, and `plot_history` are already scoped by `org_id` (D-030); a group's identity is
its `organizations` row, and `name` is the one field on it meant to be human-facing. Reading
it directly means renaming an org via the admin portal takes effect everywhere without a
second edit anywhere else.

**No new RLS policy, because the existing one already does the job.** `organizations
_authenticated_select` (M16) scopes a `select` to `id = auth.jwt() -> app_metadata ->>
'org_id'` — a signed-in, non-admin caller reading `organizations` with no filter already
gets back exactly their own row (0 or 1). Adding a bespoke "get my org" RPC or a second
narrower policy would duplicate what the RLS policy already guarantees.

**`presentation.json`'s `default.homeHeading` stays as a fallback, not removed.** Deleting
it outright would leave the screen showing nothing (or an empty string) during the fetch's
loading window, and on a fetch failure — a strictly worse regression than the bug being
fixed. Falling back to the old shared string in those narrow cases is an acceptable trade
for never showing a broken heading.

## Rejected alternatives

- **A per-colony/per-org block in `presentation.json` (`colonies.<id>.homeHeading` or an
  `orgs.<id>` block), edited by hand like `bharatkshetra`'s `noOwnerTokens` override.**
  Rejected: this is exactly the class of change the admin portal (D-032) exists to make
  self-serve — the owner explicitly renames an org there, at the rate a new group is
  onboarded, and a checked-in JSON file edited by a Claude session on every rename defeats
  that. `organizations.name` is already the field meant to hold this.
- **A new dedicated RPC (`get_my_organization()`) instead of a plain `select`.** Rejected:
  the RLS policy already returns the correct scoped row with zero extra surface; an RPC
  would add a security-definer function and a schema-cache reload (D-033) for no behaviour
  the existing table-level policy doesn't already provide.
- **Removing `presentation.json`'s `homeHeading` entirely once every org has a real name.**
  Rejected for now — it is still the fallback for the loading window and fetch-failure
  case; removing it would mean shipping no heading at all in those cases. Revisit only if a
  future session adds a guaranteed-non-empty org name at signup time (there is currently no
  such guarantee — the M16 backfill's placeholder, "Original organisation (rename me)", is
  proof an org can go a while with a name nobody chose).

## Consequences

- `App.tsx` was already sitting exactly at the 250-line cap (invariant 7) before this
  change — any net line addition needed an offsetting extraction. `useOrgName` was split
  into its own file for this reason (not because the logic itself demanded it), and
  `isStandaloneDisplay()` was moved to `pwa/installInstructionsSeen.ts` for the same reason.
  A future session touching `App.tsx` should expect to do the same.
- `ColonyPicker`'s `orgName` prop is required, not optional — every caller (the real app,
  `ColonyPicker.test.tsx`) must pass `null` explicitly rather than omitting it, so a caller
  can't silently forget to wire the fetch through and get the fallback by accident.
- An already-signed-in family member's open session does not pick up an org rename until
  the app re-fetches (reload, or the next natural remount) — same category of staleness as
  D-030's own "already-issued JWTs" consequence, not a new problem this decision introduces.
