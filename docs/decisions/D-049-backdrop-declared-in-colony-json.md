# D-049: Colony backdrop alignment can be declared in `colony.json` itself, authoritative when present

**Status:** accepted
**Date:** 2026-09-13

## Decision

`contract/colony.schema.json`'s `colony` object gains an optional `backdrop` object,
sibling to `select_zoom`, carrying the same 8 fields `ColonyBackdropScreen.tsx`'s form
already writes (`transform.{x,y,scale,rotate_deg}`, `darken_alpha`, `enabled_on_admin`,
`enabled_on_public`, `attribution`) — `attribution` **required**, not optional, so an
omitted credit is a schema-validation error rather than a silently blanked column.

When `ColonyUploadScreen.tsx`'s `upload()` succeeds (`createColonyFromManifest()`'s
`result.ok` branch, on both a fresh create and a replace), a new
`lib/colony/colonyBackdrop.ts::applyManifestBackdrop()` checks the manifest's
`colony.backdrop`:

- **Absent** — nothing is written. The colony's existing backdrop (or its defaults, for a
  brand-new colony) is left exactly as `ColonyBackdropScreen.tsx`'s own form would leave it.
- **Present** — `updateColonyBackdropTransform()` (D-047/D-048's existing function,
  unmodified) is called with the mapped values, unconditionally overwriting whatever the
  colony currently has. A failed write does not fail the upload — the colony is already
  live — it lands the user on the backdrop stage with the failure named in the intro
  message, same posture as every other error path on that screen.

The image file itself is **not** part of this — JSON cannot carry binary data, so attaching
the actual JPEG stays `ColonyBackdropScreen.tsx`'s form, unchanged, now simply pre-filled
with whatever the manifest just applied (or the colony's existing values).

This reuses D-047/D-048's write path exactly as built — `updateColonyBackdropTransform()`,
the Storage bucket, the RLS/grants — as a **second caller**, not a new mechanism. See
D-123 for the companion change that lets `tools/pipeline` propagate a hand-declared
`backdrop` through re-exports.

## Why

Owner direction (2026-09-12, this session, final decision after being shown the running
app): "everything that lives after enable public link, enable this that... i want that to
live in colony.json file only because that would be good practice for future if we add more
configuration and details" — the same reasoning that already put `select_zoom` in the
manifest rather than a separate table/file. Colony presentation config accumulates over
time (D-034); `colony.json` is already the place new per-colony declarations land.

A first attempt at exactly this was built and reverted the same session (see
`PROGRESS.md`'s `## Deferred` entry, now resolved) after `/review` found five real issues:
no `tools/pipeline` producer for the key (invariant 6 — closed by D-123, not by this
decision, since a backdrop has no DXF source to derive from); an unresolved conflict
between "JSON is authoritative" and `colonyBackdrop.ts`'s own documented "never reset a
tuned alignment on replace" rule; `attribution ?? ""` silently blanking the ODbL credit;
a fetch-error path with no way to close the screen; and zero test coverage of the actual
write. All five are closed here: `attribution` is required in the schema (no `?? ""`
anywhere it's read); the JSON-vs-replace conflict is resolved explicitly in the owner's
favor — JSON always wins when present, omission is the only way to say "leave it"; the
fetch-error path already routes to the closable `"failed"` stage; and
`ColonyUploadScreen.test.tsx` now asserts the mapped `.update()` payload directly (a
recording fake client, not a blind "resolve anything" proxy) for both the present and
absent cases.

## Rejected alternatives

- **A separate, hand-maintained JSON file for backdrop config, distinct from
  `colony.json`.** This was this session's own first fallback plan, proposed in the
  original `## Deferred` entry, before the owner's explicit preference for one file over
  two: "we already store many things like zoom config in colony.json so we could just edit
  colony.json instead of creating a new json file." Rejected once stated directly — a
  second config file duplicates `colony.json`'s own role and gives an operator two places
  to remember instead of one.
- **"Never reset a tuned alignment on replace," always, even when the manifest declares a
  `backdrop`.** Would have kept `colonyBackdrop.ts`'s existing rule (D-047 §3) literally
  intact, but makes `backdrop` in `colony.json` write-once-then-ignored on every future
  replace — useless for the actual workflow (re-export a colony after a geometry fix,
  wanting the alignment to travel with it). Rejected in favor of the owner's explicit,
  repeated choice: JSON wins whenever present, no exceptions, with omission as the
  documented way to opt out.
- **A "diff" or confirm-before-overwrite UI when JSON and the database disagree.** Adds a
  step nobody asked for and complicates the otherwise simple "present = authoritative,
  absent = untouched" rule into something needing its own state machine, for a decision
  (JSON always wins) the owner already made unconditionally.
