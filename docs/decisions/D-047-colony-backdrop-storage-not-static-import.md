# D-047: Colony backdrop moves from a Vite static import + checked-in JSON to Supabase Storage + `colonies.backdrop_*` columns

**Status:** accepted
**Date:** 2026-09-12

## Decision

The per-colony synthetic-aerial backdrop (D-036) is no longer a build-time asset. The
raster lives in a new public Supabase Storage bucket (`colony-backdrops`, one object per
colony at `<colonyId>.jpg`), and its alignment/appearance metadata (`transform.{x,y,scale,
rotateDeg}`, `imageWidth`/`imageHeight`, `darkenAlpha`, `enabledOnAdmin`/`enabledOnPublic`,
`attribution`) lives on 11 new `colonies.backdrop_*` columns — both writable only through
two new admin-portal routes (upload the image; edit the alignment numbers), with no code
change or redeploy required for either action. `mapBackdrops.ts`'s `resolveMapBackdrop
(colonyId, surface)` — a synchronous Record lookup joining a static import with
`config/mapBackdrop.json` — is replaced by `resolveMapBackdropFromRow(client, row,
surface)`, which stays synchronous by construction: `client.storage.from(...).getPublicUrl
(path)` is a pure string build, never a network call, so the metadata resolution still runs
inline inside the map's mount effect, exactly as it did before this decision, with no
async restructuring of `useColonyCanvas.ts`/`usePublicColonyCanvas.ts`'s bootstrap.

D-034's "resolved client-side, checked-in JSON" precedent is narrowed, not reversed: the
backdrop's `labels[]` array (place/road name markers) stays exactly where it was, in
`config/mapBackdrop.json`, keyed by colony id — this decision only moves the image and its
alignment, per the backlog ask that prompted it.

## Why

Owner-requested (PROGRESS.md "## Backlog — owner-requested, not started", item 6,
2026-09-09): every colony onboarded after Bharatkshetra would otherwise need a source edit
(a new static import line, a new JSON entry) and a full redeploy just to add or re-align a
backdrop image — a real scaling problem for a tool meant to onboard many family/business
groups' colonies (D-030's whole premise). The owner explicitly did not ask for a
drag-to-align UI or a rebuild of the offline stitching tool
(`experiments/map-texture-poc/stitch.html`) — "not necessarily a full redo of the offline
tool" — so the write side is a plain numeric-fields form in the admin portal (D-032's
existing, precedented home for owner-privileged, occasional, non-realtime actions), not a
new authenticated feature inside the main app's Tier-1 colony-upload screen. A backdrop is
decorative map dressing, not plot/manifest data — it has no relationship to the
human-verification gate (D-025/D-108), so reopening that screen's logic would have been
scope creep, not a requirement.

Storage over a database column for the raster itself: Postgres has no first-class binary
blob column an image this size (hundreds of KB to a few MB) belongs in, and Supabase
Storage is the platform's own built-in answer to exactly this (already proven safe for this
app's threat model — D-031 already serves this same class of "real but non-sensitive"
content, the colony's own SVG, to anonymous visitors with no extra auth machinery). A
**public** bucket was chosen specifically because the public link (D-031) needs the same
image with no session at all — the alternative (a private bucket + signed URLs minted per
request) would have required `get_public_colony()` to mint and return a fresh signed URL on
every call, adding real complexity for an asset with the same sensitivity level as the
colony's own already-public SVG geometry.

## Rejected alternatives

- **Keep the raster as a static import, move only the alignment metadata to the database.**
  Rejected: this still requires a source-code change (a new `import ... from
  "../../assets/backdrops/<id>.jpg"` line in `mapBackdrops.ts`) and a redeploy for every new
  colony's backdrop — solving only half of what the owner actually asked for.
- **A drag-to-align canvas UI in the admin portal**, closer to a full redo of
  `stitch.html`. Rejected per the owner's own explicit scope note in the backlog text; a
  plain numeric-fields form (x/y/scale/rotateDeg/darkenAlpha as `<input type="number">`,
  the two enabled flags as checkboxes) is both what was asked for and a much smaller,
  lower-risk diff for a first cut of this feature.
- **A private Storage bucket with signed URLs**, matching a more conservative default
  posture for user-uploaded content. Rejected: the backdrop is OSM-derived, non-PII,
  non-monetary imagery already destined for an anonymous public link visitor by design (D-036's
  whole point) — the same sensitivity class as the colony's own SVG, which already ships to
  that same anonymous visitor with no signing. Adding per-request signed-URL minting would
  be real, unrequested complexity (a new code path inside `get_public_colony()`, a TTL to
  choose and later revisit) purely to protect content that carries no real confidentiality
  requirement.
- **A new `colony_backdrops` join table instead of denormalized `colonies.backdrop_*`
  columns.** Rejected: denormalizing onto `colonies` (mirroring `public_token`'s own
  precedent, M17) means every existing colony-row fetch
  (`fetchColonyById`/`fetchVerifiedColonies`/`fetchColoniesByOrg`, all already `select("*")`)
  picks up the new fields for free, with zero new queries and zero new RLS policy (the
  existing org-scoped, select-only policy on `colonies` already covers them) — a join table
  would have needed both a new query and a new policy for a 1:1, single-row-per-colony
  relationship that gains nothing from being modeled separately.
