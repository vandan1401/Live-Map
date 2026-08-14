# D-018 — `owner_name` is sticky, never cleared by a status transition

**Status:** provisional — revisit if the family reports a wrong name showing on an
un-booked plot in real use.

## Decision

`plots.owner_name` is written only by `apply_plot_transition()`'s `p_owner_name`
parameter (docs/plans/08.md), and only ever via `coalesce(p_owner_name, owner_name)` —
never a bare assignment. Every transition except a fresh `available → booked` booking
omits the argument, which means the column is **never cleared** by `booked → available`
(un-book), `booked → registered`, or `registered → available`. It is only ever
overwritten by supplying a new, non-null name on the next fresh booking.

Because `owner_name` is no longer display-only, this has a real UI consequence app-wide,
not just in the detail sheet: `apps/map/src/lib/colony/searchPlots.ts`'s
`buildSearchIndex` now explicitly gates `ownerName` on `plot.status === "booked"` so a
plot search never surfaces or matches a stale buyer name once the plot is no longer
booked — the field is sticky in the database, but must not read as "still booked to that
person" anywhere the UI shows it.

## Reasoning

`PlotStatusActions.tsx`'s existing Undo feature (M4, spec/04) can walk `available →
booked` back into `booked` via `history[1].status` when undoing an accidental un-book.
`plot_history` has no `owner_name` column (only `status`, `changed_by`, `changed_at`,
`note` — M2 schema) and this plan does not add one. With a sticky `owner_name`, Undo
needs zero new code and zero new UI: the un-book step left the name in place, so the
undo-back-into-booked step's `coalesce(null, owner_name)` lands on the correct prior
buyer automatically. Clearing the field on un-book would make Undo either lose the name
(a regression from a real database's evidentiary standpoint — CLAUDE.md invariant 5, the
same principle behind `plot_history` being append-only) or require a new column plus a
history read this plan doesn't scope.

## Rejected alternatives

- **Clear `owner_name` on any transition out of `booked`.** Simpler mental model, but
  breaks Undo silently (a booking correctly undone would then show no buyer, requiring
  the user to retype a name that was never actually wrong) and has no test or spec
  requirement asking for the clear.
- **Add an `owner_name` column to `plot_history` and restore it explicitly on Undo.**
  Would make "the original buyer" precisely recoverable across more than one un-book/
  re-book cycle, not just the last one — a real improvement, but a bigger schema change
  than the owner's actual ask ("no way to enter who booked it"). Left as a future option
  if multi-cycle history turns out to matter in practice.

## Blast radius

Medium. Any future feature that reads `plots.owner_name` directly (not through
`buildSearchIndex` or `PlotDetailContent.tsx`, both of which already gate on `status ===
"booked"`) must apply the same gate or risk showing a stale buyer name for an available
plot. `PlotDetailContent.tsx`'s existing `plot.status === "booked"` guard predates this
decision (D-012 amended) and happens to already be correct; `searchPlots.ts`'s gate was
added specifically because of this decision, caught by `/review` rather than the plan
itself.
