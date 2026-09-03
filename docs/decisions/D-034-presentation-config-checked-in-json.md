# D-034: Per-colony presentation config (heading, no-owner tokens, status names/colours, dimension spacing/text) is a checked-in JSON file resolved client-side, not a database table

**Status:** accepted
**Date:** 2026-09-03
**Context:** docs/plans/27.md (Tier 2/3). The owner asked for the home-screen heading, the
CSV bulk-import "no owner" token (currently `"NMC"`, but `bharatkshetra` wants `"IV"`), the
existing three statuses' display names and colours, and the dimension-callout line
offset/text to all be "changeable via JSON" instead of hardcoded — explicitly framed as
Tier 2/3, "just wire the CSS via JSON", not a data-model change.

## Decision

`apps/map/src/config/presentation.json` — one file, a `default` block plus a
`colonies.<id>` block per colony needing an override — checked into the repo like
`tools/pipeline/colonies/<id>.json` already is on the pipeline side. `resolvePresentationConfig(colonyId?)`
(`lib/colony/presentationConfig.ts`) does a **shallow** per-key merge (a colony overriding
`statusColors` repeats all three; no recursive merge). Status colours are applied by
writing `--colony-status-*` CSS custom properties onto `document.documentElement` (via
`applyStatusColorOverrides`, `components/map/applyPresentationColors.ts`) before
`colonyTheme.ts`'s `resolveColonyTheme()` runs — D-004 ("colour lives in one CSS variable
block, the canvas renderer only ever reads it") is unchanged; JSON just becomes the thing
that writes those variables instead of `colony-theme.css`'s static `:root` block being the
only writer.

No new database column, no new table, no migration. `PlotStatus`, `transitions.ts`, and the
`plots.status` DB CHECK are untouched — this only changes what a status is *called* and
*coloured*, never what statuses exist or how they transition (D-013 stands).

## Why

**A checked-in file matches how this data actually changes.** There are 5-6 users, all
equal admins (D-007), and no admin UI is being built for this. A colony's presentation
settings change at the rate a new colony is onboarded or an owner's convention is
discovered — the same cadence as `tools/pipeline/colonies/<id>.json`, which already lives
as a checked-in file edited by hand and deployed with a normal commit. A database table
would need RLS, a write RPC, and a UI to be safely editable by any of the five family
members; none of that is justified by an edit that happens a few times a year.

**Writing CSS variables from JSON, rather than replacing the CSS mechanism, keeps D-004's
guarantee intact by construction.** The alternative — passing a colour prop down through
every draw call — would have meant re-deriving `ColonyTheme` from two different sources
depending on whether a colony has an override, doubling the surface `docs/plans/18.md`
acceptance criterion 6 (`git grep` for status hexes outside `colony-theme.css`) exists to
police. Writing the resolved value onto the same CSS variable `colonyTheme.ts` already
reads means `colonyTheme.ts` needed zero changes, and the "one colour source" property
literally still holds — the source is now JSON *feeding* that one CSS variable block,
not a second parallel one.

**Shallow, not deep, merge.** A colony overriding one status colour but not the label text
is a real case (`bharatkshetra` only overrides `noOwnerTokens`); a colony overriding
*half* of `statusColors` while inheriting the other half silently is not something anyone
asked for, and a recursive merge is the kind of code that looks harmless until a colony's
`default.statusColors.registered` quietly reappears on a `colonies.<id>` block that meant
to define its own full palette. A flat object spread (`{ ...default, ...override }`) has no
way to do that by accident.

## Rejected alternatives

- **A `presentation` JSONB column on `colonies` or `organizations`.** Rejected: any
  migration under `apps/map/supabase/migrations/**` is Tier 1 in this project's own risk
  table (CLAUDE.md), regardless of how low-risk the column itself is — the user explicitly
  asked for this batch to stay Tier 2/3, and a DB column buys nothing a checked-in file
  doesn't already give at this project's real scale (≤20 colonies today, per D-030's own
  scale note).
- **Prop-drilling a resolved theme object through every draw call instead of writing CSS
  variables.** Rejected: it would have meant `colonyTheme.ts` and `drawColony.ts`/
  `drawDimensions.ts` accepting colour data through two different paths (CSS vars for the
  base theme, a prop for status), which is strictly more surface for the exact class of bug
  docs/plans/18.md acceptance criterion 6 exists to catch, for no benefit — the CSS-variable
  route was already there and already correct.
- **Deep/recursive merge of a colony's override onto `default`.** Rejected in favour of a
  flat per-key merge — see Why above. Costs colonies wanting a genuinely partial override
  (e.g. only `noOwnerTokens`) nothing, since the granularity is per top-level key, not
  per-file.

## Consequences

- Changing a colony's presentation setting is a code change (edit `presentation.json`,
  commit, deploy via the existing Cloudflare Git-integration pipeline, D-026) — not a
  self-serve admin action. If a future session is asked for a self-serve editor, that is new
  scope requiring the DB-column path this decision rejected, not an extension of this one.
- A real bug this decision's write-CSS-variable-globally mechanism created and a `/review`
  pass caught: any code path that paints a colony (the canvas map, but also
  `renderColonyPreview.ts`'s upload-confirmation preview) must call
  `applyStatusColorOverrides(colonyId)` itself before reading the theme, or it silently
  inherits whichever colony's colours were last applied to `document.documentElement`
  elsewhere in the app. All three current callers (`useColonyCanvas.ts`,
  `usePublicColonyCanvas.ts`, `renderColonyPreview.ts`) do this now; a future new render
  path must too.
- `presentationConfig.test.ts` asserts `presentation.json`'s `default.statusColors` matches
  `colony-theme.css`'s own `--colony-status-*` values, since they are now two independent
  literal copies of the same three colours with nothing else keeping them in sync.
- An arbitrary-count/new-name status vocabulary (a real 4th status) is explicitly out of
  scope for this decision and this mechanism — it needs its own Tier-1 decision touching
  `PlotStatus`, D-013's transition table, and the DB CHECK, tracked separately
  (`PROGRESS.md` → `## Deferred`).
