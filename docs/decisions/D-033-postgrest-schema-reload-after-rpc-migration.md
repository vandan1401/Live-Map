# D-033: Reload PostgREST's schema cache and verify with a live RPC call, not `pg_proc`, after any migration that changes a function's parameter list

**Status:** accepted
**Date:** 2026-09-01
**Context:** docs/plans/20.md's `select_zoom_ref` migration was applied to the real
production Supabase project on 2026-08-31 and verified at the time via `select pronargs
from pg_proc where proname = 'create_colony_from_manifest';` → `9`. Despite that,
re-exporting and re-uploading a colony with a real `COL-ZOOM-REF` rectangle (owner test,
2026-09-01) produced a manifest with correct `select_zoom.ref_width_px`/`ref_height_px`,
an upload that reported success with no error, and a `colonies` row where
`select_zoom_ref_width_px`/`select_zoom_ref_height_px` were silently `null` anyway — three
separate rounds of code review (client parameter names, the SQL function body, which
migration last touched the function) found nothing wrong, because nothing *was* wrong on
either end. The actual cause: PostgREST caches its own introspected view of the database
schema, separate from Postgres's live catalog. `pg_proc` reflects the true current
function signature at all times; PostgREST's REST/RPC layer — what the browser's
`supabase-js` client actually calls — does not, until it is told to reload (`NOTIFY pgrst,
'reload schema'` or the Dashboard's "Reload schema cache" action). With a stale cache,
PostgREST silently called the function using only the parameter names it still remembered,
and Postgres filled the two unmentioned ones with their `default null` — no error at any
layer. This is the second confirmed occurrence of this exact class of bug in this project
(the first, referenced in `PROGRESS.md`, surfaced in the sibling portfolio repo).

## Decision

After applying any migration that adds, removes, or renames a Postgres function's
parameters (not just adds a column), explicitly reload PostgREST's schema cache — run
`NOTIFY pgrst, 'reload schema';` **and** use the Dashboard's Project Settings → API →
"Reload schema cache" action, since the notify channel alone has proven unreliable on
hosted Supabase. Then verify the change actually reached the API layer with a real RPC
call through the same client path the app uses (or, at minimum, ask the owner to redo the
actual write and check the row) — never `select ... from pg_proc` alone. A `pg_proc` query
proves the migration ran; it proves nothing about what PostgREST is currently serving.

## Why

**The two verification methods answer different questions and are not substitutable.**
`pg_proc` is a Postgres catalog view — always live, always correct, and completely
invisible to what PostgREST has cached. Trusting it as proof that "the RPC now works" is
exactly the assumption that let this bug pass a real verification step (`pronargs = 9`,
confirmed) while the actual write path stayed broken for a day.

**Silent parameter-dropping is the worst failure shape available here.** A missing-column
error, a permission error, a schema-validation error — all of those are loud and would
have been caught immediately. A function called with a subset of its own named parameters,
each missing one silently taking its SQL `default`, is indistinguishable from a correct
call at every layer except the final row's contents. This is the same class of hazard
`create_colony_from_manifest`'s own signature-change note already warns about
(`drop function` before `create or replace`, so an old overload can't stay silently
callable) — this decision extends the same wariness to the PostgREST layer sitting in
front of the function, not just the function's own definition in Postgres.

## Rejected alternatives

- **Trust `NOTIFY pgrst, 'reload schema';` alone.** This is the officially documented
  mechanism and was already run for this exact migration on 2026-08-31 (per `PROGRESS.md`'s
  own verification trail) — and the bug still reproduced a day later. Whether that NOTIFY
  never actually reached a listening PostgREST process, or the cache went stale again after
  a later migration, is not fully diagnosed; either way, `NOTIFY` alone was demonstrated
  insufficient in this project, not merely theoretically risky.
- **Trust `pg_proc` catalog checks as sufficient migration verification**, since they are
  fast, scriptable, and were already this project's established pattern (used for M16/M17's
  own verification). Rejected because this incident is direct proof they verify the wrong
  layer for anything client-facing — a passing `pg_proc` check and a broken live RPC
  coexisted for a day with no other signal.
- **Add a code-level defensive check** (e.g., have `callCreateColonyFromManifest` verify
  the RPC accepted all nine parameters before trusting the result). Rejected as solving the
  wrong layer: the client sent the correct call every time: this is entirely a PostgREST/
  Postgres cache-consistency problem, and a client-side workaround would hide it rather than
  fix the actual gap in the migration-application procedure.

## Consequences

- Every future migration that changes a function's parameter list must include an explicit
  reload-and-reverify step in its own applied-to-production note, not just a `pg_proc`
  check — `PROGRESS.md`'s existing verification trails for M16/M17/M19 predate this decision
  and were not re-audited under it; they are not known to be affected (none of those
  migrations added zoom-ref-style silently-defaulted parameters), but a future session
  touching any of them should reload-and-reverify before trusting them further.
- No code change follows from this decision — it is a procedural fix to how a migration is
  confirmed live, not a defect in `apps/map` or `tools/pipeline`.
