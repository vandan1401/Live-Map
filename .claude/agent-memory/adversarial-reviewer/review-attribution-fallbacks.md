---
name: review-attribution-fallbacks
description: Recurring defect — a fabricated, synthetic, or stale provenance value (actor fallback, a `confidence` for a match that never ran, `import` rows shown as real changes, a sticky `owner_name` on an un-booked plot) writes a fake fact into the evidence trail. Flagged five times.
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

3. 2026-08-14 (plan 05, fixture rewrite) — `fixtures/shree-vatika-2/colony.json` gave 18 of
   26 plots `"confidence": "contained"` while the same file's `source.method` is `traced`
   and its note says "Hand-traced from a phone photo". No containment match ever ran;
   `manual` is the only honest value (the other 8 plots already used it). tier-1.md:
   "A match recorded as `contained` when it was really `nearest` defeats the entire
   verification step." **Generalise the rule: any provenance/confidence/method field is an
   assertion about a process — check that process actually ran in this diff.**

4. 2026-08-14 (M6 share summary) — nothing forged the value this time; the *reader* did.
   `import-seed.ts:172` legitimately writes one `plot_history` row per plot with
   `changed_by: "import"`, `note: "initial load"`. `lib/colony/shareSummary.ts` then took the
   5 newest history rows with no filter, so the WhatsApp text the family sends out opened
   with five "changed by import" entries for changes nobody made. **Whenever a diff reads
   `plot_history` for display, ask which rows the importer wrote** — the seed rows are the
   newest rows in a freshly reset DB, so they win every `order by changed_at desc`.

5. 2026-08-15 (plan 08, buyer-name write path) — same "the reader did it" shape, one table
   over. The migration makes `owner_name` **sticky** (`coalesce(p_owner_name, owner_name)`,
   never cleared on un-book) and the plan justifies that with "`PlotDetailContent.tsx` only
   ever displays `owner_name` while `status === "booked"`". True of that file; false of
   `features/search/PlotSearch.tsx:75` + `lib/colony/searchPlots.ts:18`, which render and
   match on it for every status. Net effect: a plot returned to `available` still shows —
   and is findable by — the previous buyer's name. **When a plan defends "we never clear
   field X" with "X is only shown when Y", grep every consumer of X yourself; the plan
   author checked one.**

**How to apply:** the fix is always the same — make the guarantee structural (pass the actor
as a required prop from the component that already enforces it) or refuse the write. Related:
[[review-vacuous-acceptance-tests]].
