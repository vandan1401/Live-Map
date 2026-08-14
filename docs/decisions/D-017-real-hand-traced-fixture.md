# D-017 — Shared fixture is a real, hand-traced colony, not pipeline-generated

**Status:** provisional
**Date:** 2026-08-14

## Decision

`fixtures/shree-vatika-2/` — the one shared demo colony both halves of the repo depend
on (`colony.svg`, `colony.json`, `seed/plot-status-seed.csv`) — was replaced with a
hand-traced rendering of the owner's real site-plan photo, in place of the original
hand-authored placeholder (`source.method: "hand-authored fixture"`, note: "Hand-authored
demo. Not a real layout.").

The replacement:
- Contains 26 plots, all `block: "A"` (the real plan has no lettered blocks; the letter
  exists only to satisfy the contract's `svg_id` shape `plot-{BLOCK}-{NN}`).
- Deliberately omits ~8 interior plots whose circled numbers were not legible at photo
  resolution, and the LIG/EWS strip (an unnumbered allocation, not individually-numbered
  saleable plots on this plan).
- Ships with `verified: true` and `source.method: "traced"`, following the exact same
  D-108 bypass the original hand-authored fixture already used — hand-writing
  `verified: true` directly rather than routing through the (nonexistent, pre-M9) verify
  page. The owner's own live review of the rendered result in the running app, across
  three `/review` passes this session, is treated as the human verification pass D-108
  requires; it just isn't happening through a UI that doesn't exist yet.

## Why

The owner asked to see and work with the real colony, not a synthetic placeholder, and
`tools/pipeline` — the intended real path to a verified manifest — is still pre-M9 and
does not exist. Waiting for the pipeline to exist first would have meant the app
continued showing fabricated data indefinitely.

## Rejected alternatives

- **Add as a second colony, keep the demo fixture untouched.** Rejected by the owner
  explicitly this session — the demo fixture was always a placeholder, and CLAUDE.md's
  "one shared demo colony, deliberately" already treats a second copy as something to
  avoid rather than default to.
- **Wait for `tools/pipeline` to exist and produce this fixture properly.** Rejected —
  pre-M9 work with no scheduled date; the owner wanted to see the real colony now.
- **Guess at the ~8 unread plot numbers rather than omit them.** Rejected by the owner
  explicitly — better to have 26 confirmed plots than 34 with 8 fabricated ones.

## Consequences (see PROGRESS.md → Deferred for full detail)

- The pipeline's own golden-fixture contract (`spec/02`, `spec/10-13`, `README.md`,
  `NAVIGATION.md`) still describes and depends on a 45-plot fixture reproduced from
  `fixtures/demo-plan.pdf`. That target no longer exists. Needs a real decision before
  `tools/pipeline` is built: regenerate the golden PDF to match, or accept that the
  pipeline's golden fixture and the app's real fixture are now two different things.
- `colonies.verified` is checked only at import time, never at render — a gap that must
  close before a second (multi-colony) fixture is added, so an unverified colony can't
  render silently.
- spec/06 acceptance criterion 4 ("labels and trees hide below the zoom threshold") is
  only half-testable against this fixture, which has no trees.
