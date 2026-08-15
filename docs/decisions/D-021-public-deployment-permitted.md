# D-021 — Public deployment permitted; D-011's deploy block lifted

**Status:** accepted

## Decision

The app may now be deployed to a public URL. `.claude/hooks/guard.sh`'s block on
`wrangler pages deploy`/`wrangler deploy` (added under D-011) is removed.

## Reasoning

D-011 set exactly one condition for lifting the block: M8 ships and its own plan closes.
`docs/plans/09.md` (M8 — username/password auth, RLS locked to `select`-only plus the
`security definer` RPC as the sole write path) is now `Status: complete` — all six
acceptance criteria met, including the two manual ones the owner confirmed directly
(criterion 1: an outside username is rejected on a real device; criterion 5: the 24h
cache-TTL forced re-auth, verified directly rather than via a real 24h wait). D-011's own
Blast radius section named this exact sequence: "M8 must remove the block, mark this
superseded, and only then allow a real URL."

## Rejected alternatives

- **Leave the block in place pending a separate, later deploy decision** — rejected. D-011
  already specified the unblock condition in advance ("M8 must remove the block"); once
  that condition is met, re-litigating it as a fresh decision adds ceremony without
  changing the outcome. Deploying itself (running `wrangler pages deploy`) is still a
  distinct, separate action from removing this guard — this decision only makes that
  action possible again, it does not perform it.

## Blast radius

Low. Removes a `grep` block from a hook script; no application code, schema, or data
changes. If a future gap in auth is found, the correct response is a new decision
re-adding a block (or a narrower one), not reverting this file.
