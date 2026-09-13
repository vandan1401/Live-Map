# D-050: Backdrop image upload lives on the colony-upload picking screen; no separate in-app editing screen

**Status:** accepted
**Date:** 2026-09-13

## Decision

The backdrop image file is a third, optional file input directly on
`ColonyUploadScreen.tsx`'s `"picking"` stage, below `colony.json`/`colony.svg`, uploaded
in the same `upload()` action via `uploadColonyBackdropImage`. `ColonyBackdropScreen.tsx`
— the separate full-screen step plan 31 chained a successful create/replace into, with
its own manual x/y/scale/rotate/darken/attribution form — is **deleted entirely**, not
kept as a fallback for later edits.

A successful upload now lands on a terminal `{kind: "done", intro}` stage in the same
panel (`ColonyUploadStageView.tsx`), composed by a new pure
`colonyBackdrop.ts::composeBackdropIntro()` that reports both the manifest-alignment
outcome (D-049) and the inline image-upload outcome in one sentence.

There is now **no in-app way to hand-edit a colony's backdrop alignment**. `colony.json`'s
`backdrop` block (D-049) is the only path — fixing alignment means editing
`tools/pipeline/colonies/<id>.json` and re-uploading as a replace. The admin portal's own
separate backdrop form (`admin-portal/static/backdropEditor.js`) is untouched — a
different app, not reachable by ordinary users, and still useful as a lower-level escape
hatch.

## Why

The owner's ask, stated across multiple sessions (plans 29–32) and again directly this
session, in increasingly blunt terms: the backdrop upload belongs on the *same* screen as
`colony.json`/`colony.svg`, in one action — not a second screen reached afterward, however
that second screen was reached. Plan 31 had moved the *destination* of that second screen
(colony-picker → colony-upload, chained automatically) but never actually merged the
image input into the picking screen itself, which is what every prior attempt was
missing. When told directly mid-build to also delete the old screen rather than keep it
as a fallback, that was treated as the actual, final shape of the feature, not an
optional simplification.

## Rejected alternatives

- **Keep `ColonyBackdropScreen.tsx` reachable after upload, for adjusting alignment by
  hand or attaching an image to a colony that skipped it.** This was the plan's original
  shape (see docs/plans/33.md's first draft, before the owner's mid-build correction) —
  rejected explicitly: "please dont forget to run remove the old backdrop upload setup
  and screen." Keeping any version of the separate screen reproduces the exact thing the
  owner was rejecting, even as an optional path.
- **A smaller in-app form for alignment only, without the image upload, as a lighter
  replacement for the deleted screen.** Not proposed by the owner and not built — `colony.
  json` already carries every alignment field D-049 needs; a second, parallel place to set
  the same values invites exactly the "which one wins" ambiguity D-049 was written to
  resolve in the JSON's favor.
