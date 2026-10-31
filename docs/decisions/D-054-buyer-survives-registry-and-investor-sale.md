# D-054 — The buyer survives Registry done and Sold to investors

**Status:** provisional. The owner accepted the reverse edges and the stale-name cost (2026-10-31) and
said "the person who brought the plot" means the buyer, i.e. the Owner — not the broker (docs/plans/41.md).

## Decision

1. `isLegalTransition` lets a **custom** status move directly to and from `booked` and `registered`
   (and, as before, to and from `available` and between customs). The built-in table is unchanged.
   This supersedes the limit in docs/plans/40.md §3 ("a custom status never moves directly to or from
   booked/registered — go via available"), which that plan itself flagged for the owner's confirmation.
2. The detail sheet shows **Owner** (`owner_name`) on every status except `available`. No Broker row. Search matches the owner on the same rule (`statusShowsBuyer`,
   `lib/plot-status/buyerVisibility.ts`). This widens D-018's display gate from `status === "booked"`.
3. The buyer-name prompt stays on a fresh `available -> booked` only. From a custom status, "Mark
   Booked" is a plain button that sends no name, so `coalesce(p_owner_name, owner_name)` keeps the owner
   the plot was booked for.

## Reasoning

The owner asked that a Registry-done plot still show who bought it, and that
marking a booked plot Sold to investors keep the booked-for owner. The database already did the keeping
(D-018: `owner_name` is never cleared by a transition), so no migration
is needed — the blockers were a hard-coded `=== "booked"` display gate and the via-`available` rule.
Going via `available` would have worked data-wise, but hid the owner on the intermediate step and made
the owner-less-looking `available` plot one tap from a fresh booking prompt that overwrites the name.

## Rejected alternatives

- **Forward edges only (booked/registered -> custom).** Leaves Undo and a mis-tap with a detour through
  `available` and a retyped buyer name. Rejected for the reverse edges.
- **A buyer-name guard on custom -> booked/registered.** Needs the owner on the legality function and on
  `applyPlotTransition`'s input; more surface than the risk warrants (below).
- **Recording the owner on each `plot_history` row.** The right answer to "who was the owner at that
  time", but a schema change; out of scope, same as D-018.

## Blast radius

Low-medium. Two accepted costs, both for the owner to confirm:
- A plot that went `available -> sold_to_investors` (never booked, so no owner) can now reach
  `booked`/`registered` without a buyer name; it shows "—". Bulk import can already create a booked
  plot with no owner.
- **A stale name can show.** `owner_name` is never cleared (D-018). A plot booked for X, un-booked to
  `available`, then moved to `sold_to_investors` shows "Owner: X", is found by search for X, and its
  "Mark Booked" button re-books it for X with no prompt. Before this decision the booked-only gate hid X.
  Closing it needs a database function change or a history-based gate (out of scope; plan 41). Any future place that shows `owner_name` must use `statusShowsBuyer`, not a
status literal. `PlotTableRow` already prints owner and broker for every status and is unchanged.
