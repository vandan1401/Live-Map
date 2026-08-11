# D-002 — Supabase Postgres as the data store, not Google Sheets

**Status:** accepted

## Decision

Plot state lives in Supabase Postgres.

## Reasoning

Google Sheets was a reasonable answer while the assumption was that one office person
updates data and everyone else reads. It stopped being reasonable the moment the
requirement became four or five people changing plot status concurrently from their
phones. Money follows the status field, so it needs a real database.

## Rejected alternatives

- **Google Sheets** — free, and the office already knows how to use it, which would have
  saved building an admin panel. Rejected on three specific failures: no row-level locking,
  so two simultaneous writes silently lose one; no conflict detection, so A marking a plot
  booked and B marking the same plot booked ninety seconds later just keeps the last one
  with no error and no flag; and revision history that is unusable as an audit trail for
  "who changed plot 142 and when". For a system where a wrong status causes a commission
  dispute, silent last-write-wins is disqualifying.
- **PocketBase on a VPS** — genuinely cheap and self-owned, but it puts backups, updates,
  and 11pm outages on a one-person project.
- **JSON in the git repo** — makes the developer the bottleneck for every status change.

## Blast radius

High. The schema, RLS, realtime, and auth all assume Postgres.
