# D-052: `colonies.public_token` is auto-generated on colony creation

**Status:** accepted
**Date:** 2026-09-18

## Decision

`create_colony_from_manifest()`'s insert branch now sets `public_token = gen_random_uuid()`
unconditionally — every new colony has a working public share link the moment it's
uploaded, no second call. A one-time backfill in the same migration
(`20260918000000_colony_upload_auto_public_link.sql`) gives every colony that predates this
change a token immediately too.

The replace branch never writes `public_token` at all — not a `coalesce`, not any
conditional. This means:

- A colony's token, once generated, is stable across every re-upload/geometry-fix replace.
- A colony a human deliberately revoked (`revokePublicLink()`, still admin-only via the
  local admin-portal tool or `scripts/generate-public-link.ts`) stays revoked across every
  future re-upload — a replace cannot resurrect a link someone chose to turn off.

Self-service *generation* of a fresh token by an ordinary signed-in family member is still
out of scope — `ShareLinkButton.tsx` (`apps/map/src/features/colony-picker/`) is unchanged,
still read/copy-only. This decision only removes the "never had a token in the first place"
gap; it does not change who can rotate or revoke one.

## Why

Owner, this session: "why am i not getting share public link option in the working admin
pannel of colony whhats the use of giving public link option if i have to activate it." The
2026-09-01 design (PROGRESS.md) had deliberately kept token *generation* admin-only,
reachable only from the local-only `admin-portal/` tool — but the practical effect was that
every colony sat with no link at all until someone remembered to run that separate tool.
Confirmed via `AskUserQuestion`: the owner wanted auto-generation on creation, not a
generate button added to the main app, and not to leave the gap as-is.

## Rejected alternatives

- **Add a "Generate link" button to `ColonyPicker.tsx`/`ShareLinkButton.tsx`, reachable by
  any of the five equal-admin family members.** Offered via `AskUserQuestion`; owner picked
  auto-generation instead. Still available later if self-service rotation from the main app
  is ever wanted — this decision doesn't foreclose it.
- **`coalesce(public_token, gen_random_uuid())` on the replace branch, so a re-upload also
  backfills any colony that still had a null token.** This was the plan's first draft.
  `/review` caught that once the one-time backfill above has run once, the *only* remaining
  way a colony reaches the replace branch with a null token is a deliberate
  `revokePublicLink()` call — so `coalesce` would silently un-revoke it on the very next
  re-upload, with nobody asking. Rejected: the token is the sole access control on that
  data (invariant 8, no auth until M8), so a silent un-revoke is a real access-control
  regression, not a convenience.
- **Scope the one-time backfill to `verified = true` colonies only.** Considered and
  rejected as unnecessary complexity — an unverified colony is already invisible to
  `ColonyPicker`/`ShareLinkButton` (D-108's `verified: true` list-level filter), so giving
  it a token too is harmless, and the unconditional `UPDATE` is one line simpler.
