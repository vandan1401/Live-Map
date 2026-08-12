---
name: review-attribution-fallbacks
description: Recurring defect — a `?? "some-literal"` fallback for the actor/updated_by value papers over a missing identity and writes a fake name into the evidence trail. Flagged twice.
metadata:
  type: feedback
---

Grep every diff that touches attribution for `??` next to `updated_by`, `changed_by`, or an
actor value. A default-string fallback is a finding, not a safety net.

**Why:** `.claude/rules/tier-1.md` — "a client-supplied user id turns attribution into a
claim, and the whole point of `plot_history` is that it is not a claim." Invariant 5 makes
`plot_history` the evidence that settles a commission dispute among five family members; a
row reading `unknown` or `import` is worse than a refused write, because it looks like data.

Occurrences so far:
1. 2026-08-13 (M3 review) — `PlotDetailContent.tsx` had `plot.updated_by ?? "import"`,
   masking a nullable-column/non-nullable-type mismatch. Fixed by making the column
   `not null` and deleting the fallback.
2. 2026-08-14 (M4 Tier 2 UI) — `PlotDetailSheet.tsx:26,47`
   `const UNKNOWN_ACTOR = "unknown"; const actor = getStoredActor() ?? UNKNOWN_ACTOR;`
   Same shape, now on the **write** side. `App.tsx` already guarantees a name exists, so the
   fallback is unreachable-by-design yet would silently forge a history row if reached.

**How to apply:** the fix is always the same — make the guarantee structural (pass the actor
as a required prop from the component that already enforces it) or refuse the write. Related:
[[review-vacuous-acceptance-tests]].
