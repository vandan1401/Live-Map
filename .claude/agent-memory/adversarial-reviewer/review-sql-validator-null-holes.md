---
name: review-sql-validator-null-holes
description: Hand-written plpgsql/SQL shape validators here use bool_and/regex over jsonb elements; NULL predicates are silently skipped and ->> coerces booleans to text, so wrong-typed fields pass. Probe with docker psql, don't read.
metadata:
  type: feedback
---

When a migration adds a SQL function that validates client-supplied jsonb (the "third copy"
of a JSON Schema rule, guarding an RPC "a client can call with anything"), probe it live with
`docker exec supabase_db_colony-map psql -U postgres -tAc "select fn('...'::jsonb)"` using:
a `null` field in one element of a multi-element array, a boolean where a string is required,
a number, an array. It is immutable/read-only, so the probe is safe.

**Why:** plan 40's `valid_colony_statuses()` (2026-10-27) used
`bool_and(a and (e->>'colour') ~ re and ...)`. A null colour makes that element's predicate
NULL, and `bool_and` *ignores* NULL inputs, so `[valid, {colour:null}]` returned true; a
single-element list only failed because `bool_and` of all-NULL is NULL -> coalesce false, which
made the author's own one-element test look like coverage. `{"key": true}` also passed, since
`->>` renders it as the text `true`, which matches `^[a-z]...`. Uniqueness via
`count(distinct)` caught a null *key* only by accident.

**How to apply:** for any `bool_and`/`every` over per-element predicates, demand
`coalesce(<predicate>, false)` per element and `jsonb_typeof(...) = 'string'` on every
regex-checked field. Related: [[review-vacuous-acceptance-tests]].
