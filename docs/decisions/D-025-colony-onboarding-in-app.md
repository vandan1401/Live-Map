# D-025 — Colonies are onboarded through the app, not through a deploy

**Status:** accepted
**Amends:** D-108 (the human gate moves; it does not weaken)

## Decision

A colony becomes live by **uploading `colony.svg` + `colony.json` in the app**, by any
signed-in family member, with no local setup and no redeploy.

Three parts:

1. **The SVG becomes runtime data.** A new `colonies.svg` text column, fetched with the
   colony row. Today `ColonyMap.tsx` does `import colonySvgRaw from
   "../../../../fixtures/shree-vatika-2/colony.svg?raw"` — the geometry is compiled into the
   bundle and the path is hardcoded to one fixture, so adding a colony is a source change.
2. **One narrow write path**, `create_colony_from_manifest()` — `security definer`,
   `authenticated`-only, same shape as `bulk_set_initial_plot_data` (D-023). A browser cannot
   hold the service-role key `import-seed.ts` uses, so this is required, not a convenience.
3. **The human verification gate moves into that upload screen**, replacing the verify page's
   "Mark verified" button.

The DXF → SVG conversion stays local Python on the owner's machine (D-118 unchanged). The
owner hands over two files; anyone can upload them.

## Reasoning

### The deploy step was the real dependency, not the terminal

Running `make ingest` needs Python, not Claude, and D-113 pins the pipeline offline and
free. The step that actually required a developer was publishing: copy files into the repo,
run the seed import, redeploy. That happens **every colony, forever**, and no amount of
pipeline work fixes it because it is an app-side limitation.

### Why the gate moves

D-108 requires a human to confirm a colony before it is a deliverable, and named the verify
page's "Mark verified" button as the place. Keeping it there while adding an upload creates a
hole: the uploaded `colony.json` is a plain file, so `"verified": true` in it is just a
string someone could type. The gate would be enforced against a file, not a person.

So the pipeline now **always** emits `"verified": false`, and the upload screen renders the
SVG, shows the plot count, and requires an explicit confirmation before the RPC flips it
true. Same gate, same human, moved to where the human actually is — which is the only place a
family member without AutoCAD could ever exercise it.

This is why the upload screen is not a thin form. It is the verification gate wearing a
different hat, and it must render the real geometry, not a filename and a spinner.

### Why a screen in the app, not a separate site

Same login, same Supabase, same deploy, same offline cache. A second site would need its own
auth against the same database, and the family would have two URLs and two logins for one
job. The app already has the shape for this — `BulkImportScreen.tsx` is a full-screen
overlay that parses a file client-side and calls one narrow RPC, which is precisely this
pattern (docs/plans/10.md).

## Consequences

- **`colonies.svg`** is `text`, not Storage. One fewer service (`storage-api` is currently
  excluded from the local stack), one round trip, and it rides along with the offline
  snapshot the PWA already caches. A 300-plot colony is a few hundred KB of markup; Postgres
  TOASTs it without complaint.
- **Invariant 2 in `CLAUDE.md`** ("No code path sets it true") needed restating — a code path
  does set it now, gated on a human's confirmation in the app. **Applied 2026-08-17** with the
  owner's approval; the wording is at the bottom of this file.
- **The verify page (M14) loses its button** and becomes a fast local preview for the
  fix-and-rerun loop. Its value was never the button; it was rendering the export before
  anyone trusted it.
- **`import-seed.ts` stays** for the fixture and for local development. It is not the
  onboarding path any more.
- **Re-uploading an existing colony must be refused** unless explicitly confirmed — the
  id-stability hazard from D-118 arrives here too, and this time a family member is holding
  it.

## Rejected alternatives

- **Separate upload website** — two URLs, two logins, a second auth integration against one
  database, for a job the app is already shaped to do.
- **Keep `verified` in the uploaded file** — enforces the gate against a text string rather
  than a person. The hole is small and completely silent, which is the worst combination.
- **Sign the manifest from the verify page** (HMAC) so the app can trust `verified: true` —
  real, and solves the hole, but it means a shared secret on the owner's machine and a family
  member uploading a file nobody looked at. Confirming in front of the render is simpler and
  strictly better verification.
- **Supabase Storage for the SVG** — a service, a bucket policy, and a second fetch, to hold
  one text blob per colony.

## Blast radius

**High, and app-side.** Touches a migration, RLS/grants, `ColonyMap.tsx`'s load path, and
`App.tsx`'s colony flow. Tier 1 — needs `/plan` then `/review`.

Zero on `tools/pipeline` beyond M14 losing its button, and zero on `contract/` — the manifest
shape is unchanged, only who reads it and when.

## Invariant 2, as applied

> 2. **No colony is a deliverable until a human verified it.** Manifests carry
>    `"verified": true|false`; the app refuses `false`. The pipeline only ever writes
>    `false`. Exactly one code path writes `true` — the upload screen's confirmation, in
>    front of the rendered map (D-108, D-025).
