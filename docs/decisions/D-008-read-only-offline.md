# D-008 — Read-only offline; writes require connectivity

**Status:** provisional — proposed and not explicitly confirmed by the owner

## Decision

Cached colony data is viewable with no signal. Status changes require a live connection;
offline, the Save control is disabled and states why.

## Reasoning

Offline reads are genuinely needed — they will be standing on the site with one bar of
signal, which is exactly when they want to check a plot. Offline *writes* are a different
proposition: a write queue means two people can each mark the same plot from separate
tunnels and reconcile hours later, which reintroduces the silent-conflict problem D-006
exists to eliminate.

Roughly 80% of the engineering cost in tools like this hides in offline write sync. Deferring
it keeps M4 tractable and the conflict model honest.

## Rejected alternatives

- **Full offline write queue with reconciliation** — a real feature. Rejected for v1 on
  cost and on the conflict semantics, not on principle. Revisit if they hit the limit in
  practice.
- **Fully online, no cache** — maximum safety, but the app is useless in a field, which is
  where it is most wanted.

## Open tension, to resolve at M8

Cached data on a phone survives revoking that user's access. Revocation stops new fetches;
it does not reach into the device. M8 must pin a cache TTL that refuses to render data older
than a stated age without successful re-auth.

## Blast radius

Moderate. Adding a write queue later touches `src/lib/sync/` and every write path.
