# D-036 — A synthetic, manually-aligned aerial-style backdrop is a narrow, named exception to the "no satellite/aerial imagery" rule — for one colony's public link only

**Correction (2026-09-08, /review):** this decision's title/filename say "georeferenced" —
inaccurate. Bharatkshetra's backdrop transform is manually eyeballed
(`experiments/map-texture-poc/stitch.html`), not derived from any real surveyed GPS anchor
point. "Georeferencing" is the term reserved elsewhere in this project (`anchor_transform.py`,
`georeference.py`) for the real-anchor-point method docs/plans/28.md's Non-goals explicitly
does not use yet. Left the filename as-is (renaming it would break the cross-references
already written into `docs/plans/28.md` and `NAVIGATION.md`), but every description below
says "manually aligned," not "georeferenced."

**Durable asset copy (2026-09-08, /review, two passes):** every source citation in this
doc and in `docs/plans/28.md` points at `experiments/map-texture-poc/`, which `.gitignore`
excludes entirely — the shipped `apps/map/src/assets/backdrops/bharatkshetra.jpg` and
`apps/map/src/config/mapBackdrop.json` are self-contained and don't need it at runtime, but
four files cited as the actual evidence behind specific numbers/claims in this doc and the
plan existed ONLY in that gitignored directory and would be permanently lost on a
`git clean -xdf` or fresh clone: `backdrop_duotone_v2.png` (the master 1440×960 AI-
generated + inpainted + duotone-treated source raster the owner actually approved),
`bharatkshetra_transform_v2.json` (the transform it was manually aligned against),
`zoom_labels_demo.html` (sole prior authority for `VIGNETTE_FADE_RANGE`'s value and the
pinned label raster-pixel positions), and `osm_labels_raw.json` (the real Overpass query
result confirming the crossing highway's actual OSM tag is `ref=MD2512`, no `name` — the
evidence behind not shipping the prototype's invented "Bibdod Road" name, see
`docs/plans/28.md` §3). All four are now also committed at `docs/decisions/D-036-assets/`
— treat that as the durable copy; the `experiments/` originals remain scratch/working
files, not the source of truth. (A first pass at this note only copied the first two files
and claimed the problem solved — caught by a second `/review` pass checking the citations
against what had actually been copied.)

**Status:** accepted
**Date:** 2026-09-08
**Context:** docs/plans/28.md. A multi-day exploration (see chat history; no docs/plans/
entry until now — this is the first point the work moved from a standalone prototype
toward shipping) landed on a working composite: Bharatkshetra's real colony SVG stitched
onto an AI-generated, OpenStreetMap-informed aerial-style raster, duotone-treated, with
real OSM place/road names fading in on zoom. The owner then asked to make it live on the
real Bharatkshetra public link — at which point `spec/00-rules.md`'s "Never build" table
was found to say, with no exception: "Satellite or aerial imagery overlay — None. Ruled
out explicitly by the owner." Surfaced to the owner directly rather than silently building
past a rule that reads as a deliberate, considered prohibition; the owner's answer was to
update the rule, not abandon the feature.

## Decision

The blanket "no satellite/aerial imagery overlay" rule is narrowed, not repealed. The
table row in `spec/00-rules.md` now reads:

> **Satellite, licensed aerial, or any real photographic imagery of an actual site** —
> None. Real/licensed imagery of a real place stays banned outright, satellite or
> drone, at any license tier (D-022's own rejected-alternatives section already
> documents why: this is an offline-capable PWA with no external imagery dependency,
> and every real satellite/drone provider checked during the backdrop exploration
> turned out to be a licensing dead end for redistribution to end users — see the
> map-integration-exploration research). A synthetic, AI-generated aerial-**style**
> backdrop — not derived from any real photo of the real site — composited with real,
> freely-licensed OpenStreetMap vector data (roads, place names; ODbL explicitly
> permits this) is the sole approved exception (D-036), and only per-colony, opted in
> one at a time via a checked-in config entry (`apps/map/src/config/mapBackdrop.json`)
> — never a default every colony gets.

The original rule's real target was **real photographic imagery of an actual place** —
licensing, redistribution rights, and "this is supposed to be a plain, honest, low-cost
family-business tool, not a satellite-mapping product" were the live concerns whenever this
came up. A from-scratch synthetic image that merely *looks like* an aerial photo, with no
real photo of the real site anywhere in its provenance, doesn't implicate any of those —
which is exactly why the multi-day exploration this decision closes out spent so much of
its effort ruling out every real-imagery source (Google Maps, Esri, Bhuvan, MapTiler,
per-km² commercial satellite purchase, even a claimed-licensed drone photo that turned out
to be a screenshot) before landing on "generate it, don't source it."

## Reasoning

- **The owner's intent has demonstrably changed, not just drifted.** `D-022`'s own
  rejected-alternatives section (2026-08-22 or earlier) lists "an actual satellite/drone
  photo" as unavailable for reasons that were true then (no image-generation tool in this
  environment, no external CDN dependency) and are no longer the full picture (this session
  had a working Replicate/OpenAI-backed generation pipeline, run for real, producing a
  result the owner explicitly approved — "perfect... exactly use this image for our map").
  A stale rule blocking a change the owner has now spent several sessions actively directing
  is worse than updating the rule.
- **Narrow, not blanket, exception — matches how every other "never build" exception in this
  file is written.** Every other row with an exception names it precisely (e.g. "A one-off
  CSV import for the initial data load only," not "spreadsheets are fine now"). This
  exception is scoped the same way: synthetic-only, OSM-vector-data-only, opt-in
  per-colony-config-only. It does not reopen the door to real satellite/drone imagery, which
  stays banned for the licensing reasons D-022 and this exploration both independently
  found — see `map-integration-exploration` research for the specific dead ends (Google
  Maps JS API's ToS forbidding tile caching for offline embed even at near-zero cost;
  Esri/MapTiler/Bhuvan all restricting resale/redistribution at the tier this app could
  actually afford).
- **Keeps `spec/00-rules.md` load-bearing.** The alternative — deleting the row, or leaving
  it unchanged and building the feature anyway — either loses a real constraint (real
  satellite imagery genuinely should stay banned) or lets the spec drift out of sync with
  what the app actually does, which defeats the entire point of a "never build" list a
  future session is meant to trust at face value.

## Rejected alternatives

- **Leave the rule as-is and don't ship the feature.** Rejected — the owner directed this
  work across several sessions and explicitly approved the visual result; the rule as
  written no longer reflects a real prohibition, it reflects an out-of-date artifact of
  when it was written.
- **Delete the row entirely.** Rejected — the underlying concern (real, licensed imagery of
  a real place: cost, ToS, redistribution rights) is still completely valid and should still
  block a future session from reaching for an actual satellite/drone photo as a shortcut.
- **Make the exception generic ("aerial imagery is now allowed")** instead of narrowly
  scoped to synthetic+OSM+opt-in-per-colony. Rejected — that would silently also bless real
  satellite imagery, which is not what changed; only the synthetic-backdrop mechanism was
  actually explored, tested, and approved.

## Consequences

- `docs/plans/28.md` (this decision's context) is the first plan entry for the backdrop
  feature — everything before it was pre-`/plan` exploration, consistent with
  `map-integration-exploration`'s own "no `/plan` has been run on this" note.
- A future colony wanting the same treatment adds its own `mapBackdrop.json` entry — the
  mechanism this decision approves is colony-agnostic even though only Bharatkshetra uses it
  today (docs/plans/28.md's own scope).
- If a future request is for a REAL satellite or drone photo of an actual site, that request
  still hits the (narrowed but still real) rule and needs its own decision, not a rerun of
  this one — this decision's approval is specific to synthetic/generated imagery.
