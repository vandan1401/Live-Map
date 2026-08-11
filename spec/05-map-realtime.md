# M5 — Realtime and the freshness indicator

**Tier 1.** `apps/map/src/lib/sync/` — showing stale data as live is the failure that sends them
back to WhatsApp.

## Goal

When one person marks a plot sold, the other four see it change within about a second
without refreshing. And at every moment, everyone can see how fresh what they are looking
at actually is.

## Build

- Supabase realtime subscription on `plots`, scoped to the open colony.
- Fill transitions over ~400ms on a realtime change. This is the moment the app feels
  multiplayer rather than like a page; it is worth the effort.
- Freshness indicator, always visible: "Updated 2 min ago", turning amber and reading
  "Offline — last synced 3h ago" when the connection drops.
- Reconnect handling: on regaining connectivity, refetch the colony rather than trusting
  that no events were missed while disconnected. A missed event is invisible and permanent.
- Writes require connectivity while D-008 stands. Offline, the Save control is disabled
  and says why.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Two clients: a write in one appears in the other under 2s | Two real browser windows |
| 2 | Indicator age is real, not a fixed string | Manual, watched over 5 minutes |
| 3 | Killing the network turns it amber within 10s | DevTools offline mode |
| 4 | Reconnecting refetches rather than resuming blind | Write while B is offline, then reconnect B |
| 5 | Full gate passes | `make gate` |

## Non-goals

Offline reads from cache. That needs the service worker, which is M7.
