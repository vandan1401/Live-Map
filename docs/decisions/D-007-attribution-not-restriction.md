# D-007 — Attribution, not restriction: all users are equal admins

**Status:** accepted

## Decision

No roles, no per-user permissions, no assigned-broker scoping. Every authenticated user can
read and write every plot. Every change records who made it and when, and that is shown in
the UI: "Booked — updated by Vikas, 2:40pm today".

## Reasoning

Five family members in one business. "Brokers can only edit their assigned plots" is a
corporate structure this organisation does not have, and building it would mean maintaining
an assignment model nobody asked for.

What the situation actually needs is evidence, not gates. The confusion the daily PDF causes
is "who changed this and when", and one attribution line answers roughly all of it. That
needs no permission model at all — just an append-only history and a visible byline.

## Rejected alternatives

- **Role-based access control** — reflexive for a business app. Rejected as engineering for
  an org chart that does not exist. Adding it later is a migration plus policy changes, not
  a rewrite.
- **Read-only for some users with an approval queue** — real value in a firm with employed
  brokers; pure friction among five family members.

## Blast radius

Low to reverse. RLS policies and a role column would be additive.
