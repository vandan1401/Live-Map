# M4 — Status writes, transitions, concurrency

**Tier 1.** The highest-consequence milestone in the project. `/plan` and `/review` are
both mandatory.

## Goal

A user can change a plot's status. The change is attributed, appended to history, and
safe against two people editing the same plot at once.

## Build

- `apps/map/src/lib/plot-status/transitions.ts` — the legal transition table from D-013, and
  `applyPlotTransition()` as the only write path. Nothing else touches `plots.status`.
- Every illegal transition gets a test asserting rejection. Not a sample — every one.
- Optimistic concurrency: the client sends the `version` it last read. Mismatch returns a
  typed conflict carrying the name of whoever won. The UI must render that name, because
  "someone else changed this" is not actionable and "Rajesh changed this" is.
- The status update and the `plot_history` append happen in one transaction. Partial
  writes make history unattributable, which defeats the table.
- Undo for the user's own last change, implemented as a new forward transition with a new
  history row. Never as a delete.
- Warn when editing a plot someone else touched in the last 5 minutes. That number is a
  business trade-off — pin it in the plan, do not let it get guessed.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Every illegal transition is rejected | `pnpm test -- --run plot-status`; paste the count |
| 2 | Concurrent conflicting writes: one wins, one fails named | An actual concurrent test, output pasted |
| 3 | No history row exists without its plot update, or vice versa | Transaction test with a forced mid-write failure |
| 4 | Double-tap Save appends exactly one history row | Idempotency test |
| 5 | No `plots.status` write outside `applyPlotTransition` | `grep -rn "status" src/ --include=*.ts \| grep -v plot-status/` reviewed |
| 6 | `/review` returns no findings above the correctness bar | Reviewer output |

## Non-goals

Realtime propagation to other clients. That is M5.
