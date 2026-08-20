# D-120 — `px_per_ft` is derived at export time, never read from colony config

**Status:** accepted
**Date:** 2026-08-21
**Range:** tools/pipeline (D-1xx) — extends D-110, supersedes spec/13's literal text on this
point

## Context

`spec/13-pipe-derive-export.md`'s own text says: "**Scale**, replacing D-111's calibration
step. `px_per_ft` is asserted in the colony config; refuse if any resulting `area_sqft`
falls outside a sane band for a residential plot." Read literally, this means a human
supplies `px_per_ft` as a fixed value in `tools/pipeline/colonies/<id>.json`, and the
pipeline uses that value as the SVG scale factor.

But `contract/SPEC.md` and D-110 already pin something else as non-negotiable: "viewBox
width is always 1000. Width is fixed so the app needs no per-colony constants." A fixed,
human-supplied `px_per_ft` cannot simultaneously guarantee `site_width_ft * px_per_ft ==
1000` for every colony — site width varies per colony, and a constant scale factor only
produces exactly 1000px for the one site width it was calibrated against. The two
requirements are incompatible as literally written.

Corroborating evidence: `fixtures/shree-vatika-2/colony.json`'s real `px_per_ft` (2.6667)
and `viewbox` ([0, 0, 1000, 1390]) satisfy `1000 / px_per_ft ≈ 375 ft` site width exactly —
consistent with `px_per_ft` having been *computed* from the site's real width to hit
viewBox width 1000, not chosen independently and asserted.

## Decision

`px_per_ft` is derived at export time as `VIEWBOX_WIDTH_PX / site_width_ft`
(`pipeline/export/normalise.py::compute_transform`), and written into the manifest's
`colony.scale.px_per_ft` as an output. No `ColonyConfig` field, no colony config JSON key,
reads it. `contract/colony.schema.json`/`ColonyConfig` are unchanged by this decision — no
schema or dataclass field was added.

The QA gate's "scale" sanity check (`pipeline/export/qa.py::PLOT_AREA_SQFT_MIN/MAX`)
instead validates plausibility directly against the *raw* per-plot `area_sqft`, computed
straight from the DXF's own ring geometry (already real feet, since `config.units == "ft"`
is asserted at ingest — no scale factor is involved in that computation at all). This is
what actually catches spec/13's own stated failure case, "a DWG in millimetres read as
feet": a real plot's raw-unit area would be off by roughly `304.8² ≈ 93,000×` in either
direction, far outside any plausible residential band — independent of `px_per_ft`
entirely.

## Why

D-110's "the app needs no per-colony constants" is the more load-bearing invariant here —
it's why the app's SVG-rendering code has zero per-colony special-casing today, and
breaking it would ripple into `apps/map` (a Tier-1 change on that side too) for the sake of
matching spec/13's text exactly. A derived `px_per_ft` costs nothing extra to compute and
keeps that invariant intact with no code change required on the app side.

## Rejected alternatives

- **Read `px_per_ft` from colony config as spec/13's text literally says, and let viewBox
  width vary per colony.** Rejected: directly contradicts `contract/SPEC.md`'s explicit
  "always 1000" and D-110. Would also require every colony operator to hand-compute a
  correct `px_per_ft` themselves (`1000 / site_width_ft`) before every export — a manual
  step the pipeline can trivially do itself, and one more thing to get wrong per colony.
- **Read `px_per_ft` from config as an *expected* value, cross-check it against the derived
  one, and error on mismatch.** Adds a second config field and a new failure mode for no
  real benefit — the raw-area sanity check already catches the actual failure spec/13 is
  worried about (a gross unit mismatch), without needing an operator-supplied number to
  compare against. Rejected as unnecessary ceremony.
- **Keep the ambiguity open, mark it unresolved in the plan, ask before building.** Rejected
  in favour of resolving it during planning with the evidence already available (the
  existing fixture's own numbers) — this is a place a plan is expected to pin a decision,
  not defer to a stop-and-ask.

## Consequences

- `ColonyConfig`/`colonies/<id>.json` do not need a `px_per_ft` field, now or later, unless
  a future colony genuinely needs to override the derived scale for some reason not yet
  encountered (no such case exists today).
- `docs/plans/14.md` §3 documents this same reasoning inline, flagged explicitly for
  `/review`'s scrutiny at build time — this file is the durable record; the plan is the
  build-time trace.
- If a future spec or the owner explicitly wants a *fixed*, non-1000 viewBox width per
  colony, that is itself a new decision superseding D-110, and this decision would need
  re-examining alongside it — the two are coupled.
