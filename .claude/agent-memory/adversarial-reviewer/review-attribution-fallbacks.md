---
name: review-attribution-fallbacks
description: Recurring defect — a fabricated, synthetic, or stale provenance value (actor fallback, a `confidence` for a match that never ran, `import` rows shown as real changes, a sticky `owner_name`, a JWT claim the user can rewrite, an ODbL credit on an invented place name) writes a fake fact into the evidence trail. Flagged eight times.
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

6. 2026-08-15 (plan 09, M8 auth) — **"server-side" is not the same as "not client-controlled."**
   `20260815020000_m8_auth_rls_lockdown.sql:39` derives attribution inside a `security
   definer` function from `auth.jwt() -> 'user_metadata' ->> 'display_name'`, and D-020
   claims "a forged request body has nothing to tamper." But GoTrue's `user_metadata` is
   *self-writable*: `PUT /auth/v1/user {"data":{"display_name":"..."}}` with only the anon
   key plus the user's own session rewrites it, and the next JWT carries it. Proven by
   curl + a rolled-back `apply_plot_transition` call that attributed to the forged name.
   **Rule: for any JWT claim used as evidence, ask who can write it — `user_metadata` is
   the user, `app_metadata` is service-role only.** Same question for any "derived from the
   session" phrasing.
7. 2026-08-15 (plan 09, same diff) — the `?? "unknown"` literal came *back*, in
   `lib/auth/session.ts:36`'s `getDisplayName`, in the very plan whose §3 named that exact
   string as the mistake not to reintroduce. Grep the placeholder strings themselves
   (`"unknown"`, `"import"`, `"system"`, `"anonymous"`) on every diff that touches identity.

8. 2026-09-08 (plan 28, backdrop labels) — **attribution of shipped *content*, not of a
   database row.** `apps/map/src/config/mapBackdrop.json` ships nine labels under
   `"attribution": "Place/road labels © OpenStreetMap contributors (ODbL)"`. Six of the nine
   read `"Bibdod Road"`. The prototype's own source comment
   (`experiments/map-texture-poc/zoom_labels_demo.html:114`) says that road was *named*
   "Bibdod Road (the real village it runs past) rather than its OSM ref=MD2512 tag" — i.e.
   OSM carries `ref=MD2512` and no `name` for it, and the string is invented. Nothing in
   `docs/plans/28.md` §3, `D-036`, or `PROGRESS.md` records that. **Rule: an attribution/
   credit string is a claim about where the adjacent data came from — check the source for
   the field the string names, not just that the source was used somewhere in the pipeline.**
   Extra pull here: the label is styled as a road-shield chip, a convention that exists for
   `ref`s specifically, so the presentation reinforces the false claim.

9. 2026-09-08 (plan 28, same feature, next pass) — #8's label text was fixed to the real
   `ref=MD2512`, but the credit is still **scoped to the wrong artifact**.
   `mapBackdrop.json`'s string reads "Place/**road labels** © OpenStreetMap contributors
   (ODbL)" and `PublicColonyView.tsx:137` renders it only `when backdrop.data.labels.length
   > 0`. `D-036` itself says the shipped raster is "composited with real, freely-licensed
   OpenStreetMap vector data (roads, place names)" — and the JPEG visibly contains the OSM
   road/river network. So the ODbL obligation attaches to the **image**, which is credited
   only as a side effect of the DOM labels existing; a future `mapBackdrop.json` entry with
   `labels: []` ships an OSM-derived Produced Work with no notice at all. **Rule: check what
   the credit string *names* against what in the diff is actually derived from the source —
   a credit gated on a proxy (labels exist) rather than on the obligation's cause (the asset
   is derived) is the same defect as a `?? "unknown"`: it looks like provenance and isn't.**

**How to apply:** the fix is always the same — make the guarantee structural (pass the actor
as a required prop from the component that already enforces it) or refuse the write. Related:
[[review-vacuous-acceptance-tests]], [[review-gitignored-provenance]].
