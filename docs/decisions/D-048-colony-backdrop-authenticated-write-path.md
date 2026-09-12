# D-048: Colony backdrop is also writable by an ordinary signed-in org member, from inside the app

**Status:** accepted
**Date:** 2026-09-12

## Decision

An authenticated org member (the ordinary signed-in app client, anon key — not the
admin-portal's service-role key) can now upload and align their own organization's colony
backdrop directly from the app: a new "Backdrop" button on each row of `ColonyPicker.tsx`
opens `ColonyBackdropScreen.tsx`, which calls `lib/colony/colonyBackdrop.ts`'s
`uploadColonyBackdropImage`/`updateColonyBackdropTransform` — the exact same functions D-047
introduced, unmodified in shape — with the app's own client instead of a service-role one.

This required opening exactly two things, both scoped as narrowly as the mechanism allows:

- **Storage**: three RLS policies on `storage.objects` (INSERT, UPDATE, and — non-obviously
  — SELECT, see the Surprises note below) scoped to the `colony-backdrops` bucket and the
  caller's own org, via a join back to `colonies` keyed on the object's filename.
- **`colonies`**: a **column-level** `grant update (...)` naming exactly the 11
  `backdrop_*` columns, plus a matching org-scoped RLS policy. `authenticated` still cannot
  touch `verified`, `svg`, `name`, `status`, or any other column on this row through a raw
  table update — M8's blanket revoke of insert/update on `colonies` from `authenticated`
  stays exactly as it was; Postgres checks column-level ACLs independently of that
  table-level revoke, which is what makes this narrow grant possible without a
  `security definer` RPC.

`lib/colony/colonyBackdrop.ts`'s two functions also gained a real fix, applicable
regardless of which caller uses them: both now confirm their `.update()` on `colonies`
actually matched a row (`.select("id").maybeSingle()`, throwing if null) rather than trusting
`{error: null}` alone. Under the service-role key this never mattered (a matching id always
exists); under RLS, a wrong org or a nonexistent colony id makes the same `.update()` match
zero rows *silently* — this was a real, latent gap in the admin-portal's own path too, just
never observable there until a caller without service-role's blanket bypass existed.

The admin-portal's own backdrop routes/UI (`admin-portal/backdropRoutes.ts`,
`admin-portal/static/backdropEditor.js`) are **unchanged** and stay in place — this is a
second caller of one write path, not a replacement of the first.

## Why

Owner follow-up on D-047's work, same session: "the backdrop upload should be present in
upload colony section where we can upload json,svg,backdrop" — the admin-portal's own
service-role-gated UI meant only the owner, running `make admin-portal` locally, could ever
set a colony's backdrop, which does not scale to a multi-tenant app where every org member
is an equal admin (D-007) managing their own organization's colonies day to day.

The first version of this plan (see Rejected alternatives) tried to satisfy "put it in the
JSON that holds almost everything about a colony" literally, by extending
`contract/colony.schema.json` with an optional `backdrop` object and threading it through
`create_colony_from_manifest()` as eleven new trailing parameters. Reverted mid-build, before
any of it was written to disk, on the owner's own direct pushback: "isn't this too much
effort... do we need migrations and all this?" The honest answer was yes for the
*mechanism* (a migration was unavoidable either way, since Storage/`colonies` grants for
`authenticated` don't exist without one) but no for the *scope* — D-047's bucket and columns
already existed and worked; the only real gap was which client role could write to them.
Narrowing to exactly that gap turned a `contract/`-touching, 20-parameter RPC rewrite into a
migration adding three Storage policies and one column-level grant, with zero change to the
manifest schema, the RPC, or `tools/pipeline`.

## Rejected alternatives

- **Route backdrop image + alignment through `create_colony_from_manifest()`, as a new
  optional `colony.backdrop` object in the manifest JSON.** This was the plan's own first
  draft — `contract/colony.schema.json` gained a `backdrop` schema (mirroring
  `select_zoom`'s existing optional-object precedent exactly), `ColonyManifest`'s TypeScript
  type grew to match, and the RPC gained 11 new trailing parameters with `coalesce`-against-
  existing-value logic to let a replace preserve an already-uploaded image without
  re-attaching it every time. Reverted before implementation, once the owner's own
  clarifying answer made clear the ask was "reachable from the app," not "part of the
  colony-upload transaction" — routing through the manifest would have coupled backdrop
  changes to a full svg+json re-upload for what is, in practice, an iterative "upload once,
  nudge the alignment while looking at the real map, repeat" workflow. Keeping backdrop
  entirely decoupled from colony upload/replace (this decision) means alignment can be tuned
  any number of times without ever touching plot geometry.
- **A drag-to-align UI**, closer to a full port of `experiments/map-texture-poc/stitch.html`.
  Rejected for the same reason D-047 rejected it: plain numeric fields are what was asked
  for, and a much smaller diff for a first cut.
- **A `security definer` RPC instead of column-level grants + RLS.** Would have worked (the
  same shape `apply_plot_transition`/`create_colony_from_manifest` already use), but is
  strictly more machinery than needed here: there is no cross-table invariant to protect (no
  history to append, no derived field to keep consistent), just "can this org member touch
  these 11 columns on their own org's row" — a fact RLS plus a column grant already states
  directly, without an intermediate function body to keep in sync with the columns it
  writes.
- **A table-wide `grant update on colonies to authenticated`, relying on RLS alone to scope
  rows.** Rejected outright, not seriously considered past the first draft: RLS scopes which
  *rows* a role can touch, never which *columns* — a table-wide grant would let any
  authenticated org member overwrite `verified`, `svg`, `status`, or any other column on
  their own org's colonies via a raw client `.update()` call, silently reopening every write
  boundary D-025/D-108/M8 spent real effort closing.
