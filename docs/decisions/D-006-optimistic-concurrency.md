# D-006 — Optimistic concurrency with loud failure, never last-write-wins

**Status:** accepted

## Decision

`plots.version` increments on every status change. A client sends the version it last read;
a mismatch rejects the write and returns the name of the user whose change won. The UI shows
that name.

## Reasoning

Five people editing the same few hundred rows from phones will collide. The question is only
whether a collision is visible.

Silent last-write-wins produces the exact failure this app exists to prevent: A marks plot
142 booked for one buyer, B marks it booked for another ninety seconds later, the second
write wins, and nobody finds out until two buyers turn up. A loud failure — "Rajesh changed
this plot, refresh" — turns an invisible data-loss bug into a five-second conversation.

Returning the **name** rather than a generic conflict message is deliberate. "Someone else
changed this" gives the user nothing to act on; a name ends the confusion immediately, which
is exactly what the daily PDF fails to do today.

## Rejected alternatives

- **Last-write-wins** — the default, and what Google Sheets would have given. Rejected as
  the specific failure mode this project exists to eliminate.
- **Pessimistic locking** — a user holding a lock on a phone that went into a tunnel blocks
  the plot indefinitely.
- **CRDT merge** — a plot has one status. There is nothing to merge.

## Blast radius

High. Touches the schema, every write path, and the error surface of the UI.
