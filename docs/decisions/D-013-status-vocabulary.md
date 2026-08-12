# D-013 — Status vocabulary and legal transitions

**Status:** provisional — **confirm before M2 writes the migration**

## Decision

Four statuses:

| Status | Means |
|---|---|
| `available` | For sale, uncommitted |
| `booked` | Buyer committed, money taken, registry not done |
| `registered` | Sale deed executed |
| `hold` | Deliberately withheld from sale by the family |

Proposed legal transitions:

```
available  → booked, hold
booked     → registered, available   (available = a cancellation)
hold       → available
registered → available               (available = a cancellation, see below)
```

**Amended 2026-08-12, during M2 planning:** `registered` is not terminal. A
`registered → available` reversal exists, symmetric with `booked → available` — it appends
a new `plot_history` row recording the reversal rather than deleting or editing the
`registered` row that preceded it, so the record of what happened is never lost. This
reopens the question the original reasoning below flagged as the single most important
thing to confirm; the owner has since confirmed a reversal path is needed. The exact
real-world trigger for this transition (a cancelled registry, a clerical correction) is
still to be confirmed against the family's actual process — this decision only settles
*that* the schema and vocabulary must allow it, not the operational detail of when it's
used. Enforcement of this transition table lives in `applyPlotTransition()` (M4); M2 only
needed the schema to not preclude it.

## Reasoning

These four were used throughout planning — including in a rendered map legend the owner
reviewed — without objection. They match the vocabulary of Indian plot sales.

`booked → available` is included because bookings do fall through, and a cancellation must be
representable. It appends a history row like any other transition, so the reversal is
recorded rather than erased — which is exactly what a later commission dispute needs.

`registered` is terminal on the assumption that a registered sale is not undone in this
system. **This is the single most important thing to confirm.** If a registry can be
cancelled, that transition must exist from the start; adding a terminal-state escape hatch
after live data exists is significantly harder than including it now.

## Why this is provisional

Tacit acceptance is not confirmation. The family's real words may differ — "sold", "agreement
done", "part payment" are all common — and a status the UI does not have is a status they
will encode in the notes field, where nothing can filter or count it.

## Rejected alternatives

- **A free-text status field** — matches whatever they say today, and makes the legend filter,
  the counts, and the transition rules impossible.
- **More granular statuses** (part-payment, agreement-signed, registry-pending) — plausible,
  but inventing states they did not ask for is worse than missing one they did.

## Amended 2026-08-14 — hold removed, three statuses

The owner gave a direct, explicit decision this session: three statuses, not four.
`hold` (deliberately withheld from sale) is removed entirely — confirmed explicitly
rather than assumed when asked what should happen to the family's on-hold plots (they're
remapped to `available` in the demo seed data, since `hold` no longer exists as a
concept). `registered` is now displayed as **"Registry done"** — the stored word is
unchanged (`registered`), only `formatStatusLabel()`'s rendering changes, the same
storage/display separation D-010 already established for money.

New transition table:

```
available  → booked
booked     → registered, available   (available = a cancellation)
registered → available                (available = a cancellation, per the 2026-08-12 amendment above)
```

Stored CHECK constraint values are `available`, `booked`, `registered` — `plots` and
`plot_history` both updated in the same migration
(`20260814000000_status_vocabulary_and_dimensions.sql`). Historical `plot_history` rows
that already recorded `hold` before this change are append-only and were not touched —
the CHECK only validates new writes, it does not retroactively rewrite evidence.

This is a real word being retired, not a provisional detail — the family's real WhatsApp
PDF vocabulary is still unconfirmed (the original reason this decision stayed
provisional), and this amendment doesn't resolve that; it reflects the owner choosing to
simplify ahead of that confirmation rather than wait for it.
