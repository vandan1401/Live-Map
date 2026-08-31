---
name: review-prod-migration-deploy-order
description: The local DB is always ahead of production here (owner applies migrations by hand), and fetchPublicColony/RPC results are unchecked `as` casts — so any RPC return-shape change plus a UI that reads the new fields renders blanks in production until the owner runs the migration.
metadata:
  type: feedback
---

When a diff adds fields to an existing RPC's return shape **and** a UI that reads them,
check for the PROGRESS.md `## Deferred` entry naming the migration file as pending on the
production Supabase project. Its absence is a finding, not a formality.

**Why:** production migrations here are applied by the owner by hand, days late
(PROGRESS.md's own log: the zoom-ref migration sat unapplied for weeks; M16/M17 were caught
up in one batch on 2026-08-31). Every RPC result crosses into TypeScript through an
unchecked cast — `apps/map/src/lib/db/colonies.ts`'s `return data as PublicColonyResult`
— so a deployed UI reading fields the deployed RPC does not return gets `undefined`, not an
error. On plan 25 that meant a public visitor tapping a plot would see a panel with a blank
heading and " ft / ft / sq ft". `tsc` cannot see this: the type says the fields are
non-optional strings/numbers. Same family as [[review-optimistic-defaults]].

**How to apply:** for any migration touching a function the app already calls in
production, (1) grep PROGRESS.md for the new migration's filename — if it is absent from
`## Deferred`, that is the finding, with "add the entry in the same shape as the M16/M17
ones" as the fix; (2) ask what the UI renders when the field is `undefined`, because there
is no runtime validation layer between the RPC and the component. Local green proves
nothing about this: `supabase db reset` always leaves the local DB fully migrated
([[review-migration-empty-db-blind-spot]]).
