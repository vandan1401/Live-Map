# D-024 — `subscribePlotChanges` opens one realtime channel per call, not one per colony

**Status:** accepted

## Decision

`subscribePlotChanges(client, colonyId, handlers)` (`apps/map/src/lib/sync/
subscribePlots.ts`) suffixes its channel topic with a random id generated on every
invocation (`plots-changes-${colonyId}-${randomSuffix}`), instead of a bare
`plots-changes-${colonyId}`. Any number of callers may now subscribe to the same colony at
the same time, each getting an independent realtime channel.

## Reasoning

Found live, not by any unit test: the docs/plans/10.md table view (`PlotTableView.tsx`)
overlays the map rather than unmounting it, so both `ColonyMap.tsx`'s `attachSync` and the
table view's own `subscribePlotChanges` call end up subscribed to the same colony at once.
supabase-js's `client.channel(topic)` returns the *same* channel object for a repeated
topic string. The first caller's chained `.channel().on().subscribe()` marks that object as
subscribed synchronously (no network round-trip needed for the flag to be set); the second
caller's `.channel(sameTopic)` gets that same, already-subscribed object back, and `.on()`
throws: `"cannot add postgres_changes callbacks... after subscribe()"`. With no error
boundary anywhere in `apps/map`, an uncaught error during a passive-effect commit unmounts
the entire React root — the owner saw this as a plain white screen the moment they clicked
into the new Table view.

A random per-call suffix is the minimal fix: it makes `subscribePlotChanges` genuinely
call-scoped rather than colony-scoped, matching what its callers actually assume (each
caller manages its own subscription lifecycle independently, via its own returned
unsubscribe function). No caller anywhere in the codebase depends on the exact topic
string — confirmed by grep before making the change.

## Rejected alternatives

- **A module-level registry so a second call reuses the first's channel and multiplexes
  handlers onto it** — rejected: real, but meaningfully more complex (shared
  subscriber-count bookkeeping, handler-array management, careful unsubscribe semantics so
  one caller's cleanup doesn't kill another's still-live subscription) for a problem a
  five-line change already solves. Worth reconsidering only if channel count becomes an
  actual resource concern (unlikely at this app's scale — 5-6 users, a few colonies).
- **Make `PlotTableView` unmount `ColonyMap`'s Leaflet instance while open, so only one
  subscriber ever exists** — rejected during the original build (see docs/plans/10.md §2.3):
  Leaflet's mount effect is not cheap to tear down and reinitialise, and the whole point of
  overlaying rather than replacing was to avoid that cost and risk.
- **Wrap the app in a React error boundary so a crash in one feature doesn't take down the
  whole tree** — a real, independently worthwhile hardening step, but doesn't fix the
  underlying collision (the table view would still fail to load, just without crashing
  everything else) and is out of scope for this fix. Worth a future session's attention as
  defense in depth, not a substitute for fixing the actual bug here.

## Blast radius

Low. One function, `subscribePlotChanges`, in one file. `attachSync.ts`'s behavior is
unchanged (still exactly one channel, just a different exact topic string it never
inspected). Any future feature that also wants a live view of colony data can now safely
call `subscribePlotChanges` without first auditing who else might already be subscribed.
