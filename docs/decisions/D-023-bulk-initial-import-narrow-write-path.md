# D-023 — Initial CSV/XLSX import is a second, narrowly-scoped write path, gated by a sentinel eligibility window

**Status:** accepted

## Decision

`bulk_set_initial_plot_data(p_colony_id, p_rows)` (`apps/map/supabase/migrations/
20260816000000_bulk_initial_plot_import.sql`) writes `plots.status` and related fields
outside `applyPlotTransition()` — the only other function permitted to do so. It never
calls `isLegalTransition()`; it directly sets status/owner/broker/rate/date fields on an
existing plot row. A row is eligible only while every one of its `plot_history.changed_by`
values is the literal sentinel `'import'` or `'bulk_import'` — never a real signed-in
user's display name. The instant a real `applyPlotTransition()` call lands on a plot
(which always writes the real actor, never a sentinel), that plot is permanently locked out
of bulk-import for good. Before that point, the same colony's file can be re-uploaded as
many times as needed — each bulk-import row overwrites the previous one and appends
another `plot_history` row, visibly, not silently.

## Reasoning

`spec/00-rules.md`'s "Never build" table already names this exact exception for `apps/map`:
*"Google Sheets or any spreadsheet as the live data store | A one-off CSV import for the
initial data load only."* CLAUDE.md's invariant 4 ("plot status changes through exactly
one function, `applyPlotTransition()`") governs the *operational* transition path used by
the map and the new table view (D-024's sibling feature) — a plot a family member is
actively managing. It was never meant to cover the one-time act of recording a fact that
was already true before the app existed (a plot sold last year, entered from a paper
ledger). Forcing that through `isLegalTransition()` would be actively wrong: a plot's true
starting state can be `registered` with no `available`/`booked` steps in between, which
`applyPlotTransition()`'s three-status ladder cannot express in one call.

The sentinel-based eligibility (not "zero history rows," not "runs exactly once") is what
makes onboarding usable: a real colony's first CSV will have typos, and requiring a full
`supabase db reset` to fix row 200 of a 300-row file would be a worse failure mode than
letting a plot be re-set as many times as needed *before anyone starts using the app for
real*. The moment real usage starts (a genuine `applyPlotTransition` call, which can only
ever write a real display name), the correction window closes for that plot specifically —
not for the whole colony, and not on a timer.

## Rejected alternatives

- **Routing bulk rows through `applyPlotTransition()`, one call per legal hop** — rejected:
  cannot express "already registered" as an initial state without inventing a synthetic
  chain of illegal-by-design transitions, and would attribute a decade-old sale to today's
  uploader in `plot_history`, which is exactly the "claim, not evidence" failure invariant
  5 exists to prevent.
- **"Zero history rows" as the eligibility bar (true single-shot)** — rejected: a single
  typo anywhere in a large file would force a full database reset to correct, an
  unacceptably high cost for a UI whose entire purpose is being easier than a terminal
  script for a non-technical family member.
- **A time-boxed correction window (e.g. 24h after first import)** — rejected as an
  unnecessary extra number to pin and explain; "before any real use" is a self-evident,
  self-enforcing boundary that needs no clock.
- **Storing the real uploader's identity as `changed_by`** — rejected: it would make the
  eligibility check either match against arbitrary real names (fragile, and blocks a
  second family member from continuing the same onboarding) or require a separate
  `is_bulk_import` column. The sentinel is simpler and mirrors `scripts/import-seed.ts`'s
  own precedent (`changed_by: "import"`); real attribution is preserved instead in
  `plot_history.note` ("Bulk initial import by `<display name>`").

## Blast radius

Medium. A second `security definer` function alongside `apply_plot_transition()`, its own
migration, its own `execute` grant (`authenticated` only). Touches `plots`/`plot_history`
directly, same tables the operational path writes — a bug here has the same blast radius
class as a bug in `apply_plot_transition()` itself (wrong owner name, wrong money value on
a live colony). Contained by the eligibility check: it can never touch a plot with any real
transition history, so its worst-case damage is limited to colonies still mid-onboarding.
