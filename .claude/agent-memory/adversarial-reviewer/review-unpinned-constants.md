---
name: review-unpinned-constants
description: Recurring defect — a plan pins one tolerance constant, the implementation adds a second, unpinned one beside it that silently widens the accept window. Compute the resulting hole yourself.
metadata:
  type: feedback
---

When a plan §3 pins a tolerance, check whether the implementation added *another* constant
next to it. A pinned lower bound plus an invented upper bound is a *window*, and everything
outside the window is silently accepted.

**Why:** 2026-08-20 (plan 12, M11). `docs/plans/12.md` pinned
`CLOSE_GAP_TOLERANCE_FT = 1e-6` and said explicitly "Resolve by what makes the spec's own
criterion 2 pass, not by guessing further here." `pipeline/geom/__init__.py:30` added
`NEAR_CLOSE_SUSPICION_FT = 0.01` and wrote the check as
`if CLOSE_GAP_TOLERANCE_FT < gap <= NEAR_CLOSE_SUSPICION_FT`. The acceptance test uses the
spec's 0.001 gap, which lands inside the window and passes; a 0.02–1 ft gap — the same
"owner did not `PEDIT → Close`" defect spec/11's *Note on criterion 2* says must be
rejected — sails through. Nothing in the plan, PROGRESS.md, or the commit records the new
constant as a decided-alone judgement.

**2nd occurrence, 2026-09-08 (plan 28, backdrop).** `useMapBackdrop.ts:21`
`VIGNETTE_FADE_RANGE = 1.2` is *not* in plan §3's pinned list (which names only
`BACKDROP_FIT_PADDING` and `BACKDROP_MIN_ZOOM`), and its comment justifies it as "eyeballed
against the approved ... zoom_labels_demo.html prototype". That prototype has an exact
equivalent: `edgeBlurOpacity(s) = 1 - (s - baseScale)/(baseScale * 0.6)`, i.e. fully faded at
1.6x the fit scale = **log2(1.6) = 0.678 zoom levels**, not 1.2 — and the prototype's own
comment says that blur "is what was blurring the plot numbers". **When a constant's only
justification is "eyeballed against <prototype file>", open the prototype and convert its
units: a multiplicative scale ratio and a Leaflet zoom delta are not the same number.**

**How to apply:** for any tolerance check, write out the accept/reject intervals and probe
the boundaries directly with the project venv rather than trusting the test that shipped —
one `python -c` loop over `[0.001, 0.02, 0.05, 0.5, 2.0]` settles it. Also check *which*
check fires: in that case gaps perpendicular to the closing edge were caught by a *later*
`is_valid` self-intersection test, which masks the hole unless you also probe a gap
collinear with the closing edge. Related: [[review-vacuous-acceptance-tests]],
[[review-optimistic-defaults]].
