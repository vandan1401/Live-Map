# M15 — Colony upload and the in-app verification gate

**Tier 1** (`apps/map/supabase/migrations/`, `apps/map/src/features/colony-upload/`,
`apps/map/src/components/ColonyMap.tsx`). `/plan` then `/review`.

App-side, not pipeline — the first spec above `08` that belongs to `apps/map`. It is what
makes a colony go live without a developer (D-025).

## Goal

A family member is handed `colony.svg` and `colony.json`, drops both into the app, looks at
the rendered map, confirms it matches the plan, and the colony appears in the picker for
everyone. No terminal, no redeploy, no local setup.

## Build

### 1. The SVG becomes runtime data

Migration: `colonies.svg text`. `ColonyMap.tsx`'s build-time
`import colonySvgRaw from "…/colony.svg?raw"` goes away; the SVG arrives with the colony row
and is parsed by the existing `parseColonySvg` path. The fixture keeps working — it is seeded
into the column rather than compiled in.

This is the load-bearing change. Everything else here is a form.

### 2. `create_colony_from_manifest()`

`security definer`, `execute` granted to `authenticated` only, `revoke … from public` — the
same shape and the same footguns as `bulk_set_initial_plot_data` (D-023, docs/plans/10.md,
including the `grant execute` check that RPC needed).

- Takes colony metadata, the SVG text, and the plots array. One transaction: `colonies` row
  plus every `plots` row, or nothing.
- **Refuses if the colony id already exists**, unless an explicit replace flag is passed.
  D-118's id-stability hazard arrives here with a family member holding it — a re-cut colony
  that drops an `svg_id` orphans the `plot_history` rows that settle commission disputes
  (invariant 5).
- Seeds `plot_history` with the existing `import` sentinel so the share summary's "recent
  changes" never shows fabricated activity — the bug `/review` has already caught twice, once
  for `import` and once for `bulk_import`.
- Sets `verified` from the confirmation, never from the uploaded file. See below.

### 3. The upload screen is the verification gate

`features/colony-upload/ColonyUploadScreen.tsx`, a full-screen overlay reached from the
colony picker. `BulkImportScreen.tsx` is the working precedent for the shape: parse
client-side, reject a malformed file outright before any RPC call, one narrow write.

The screen must, in order:

1. Validate `colony.json` against `contract/colony.schema.json` client-side. A file failing
   the schema never reaches the network.
2. Reject a manifest carrying `"verified": true`. The pipeline only ever emits `false`
   (D-025); `true` in an uploaded file means someone edited it by hand.
3. Check every `svg_id` in the manifest has a matching element in the SVG, and vice versa.
   A mismatch here is the silent-orphan failure — the plot renders nowhere and is invisible.
4. **Render the SVG at full size**, with the plot count, block letters, and the colony name
   from the manifest.
5. Require an explicit confirmation — a checkbox reading roughly "I compared this against the
   site plan" plus a button — before enabling upload.

Step 4 is not decoration. It is the whole reason this screen satisfies D-108: the human sees
the geometry before it becomes a deliverable, and a mirrored Y-flip or a wrong scale is
obvious in the render and invisible in the JSON.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | The fixture colony renders from `colonies.svg`, not a build-time import | `grep` for `?raw` in `apps/map/src` returns nothing |
| 2 | Uploading the fixture's two files creates a colony visible in the picker | Manual, against a reset DB |
| 3 | A manifest failing the contract schema is rejected before any network call | Unit test on the parser |
| 4 | A manifest with `"verified": true` is rejected | Unit test |
| 5 | Upload is disabled until the confirmation is ticked | Manual |
| 6 | A manifest whose `svg_id` set disagrees with the SVG is rejected | Unit test |
| 7 | Re-uploading an existing colony id is refused without the replace flag | Live-integration test against the local DB |
| 8 | `create_colony_from_manifest` has `execute` for `authenticated` only | `psql`, same check docs/plans/09.md used |
| 9 | An anon client calling the RPC gets `42501` | Live-integration test |
| 10 | Seeded `plot_history` rows never appear in the share summary's recent changes | Unit test |
| 11 | A family member completes the whole flow on their own phone | Manual, the owner watching |
| 12 | `/review` returns no findings above the correctness bar | Reviewer output |

## Non-goals

Editing geometry in the app, converting DXF in the browser, and deleting a colony. The fix
for bad geometry is the DXF (D-118); this screen only ever accepts or refuses.
