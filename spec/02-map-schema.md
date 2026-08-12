# M2 — Schema, seed import, status colours

**Tier 1.** Migrations and the plot-status module. `/plan` before `/build`, `/review`
before `/wrap`.

## Blocked on

D-012 and D-013 are provisional. Confirm the real field list and status words against the
family's WhatsApp PDF **before** writing the migration. Adding a column later is cheap;
renaming one after live data exists is not.

## Goal

`colonies`, `plots`, `plot_history` exist. The fixture manifest and seed CSV import
cleanly. Plots render in their status colours, driven by `data-status` set at runtime.

## Build

- Migration per `docs/decisions/D-012` and `D-013`. Money columns end in `_paise` and are
  `bigint`. `plots.version` is `integer not null default 1`.
- Unique constraint on `(colony_id, svg_id)` — in the database, not in application code.
- `plot_history` append-only, enforced by a trigger or a policy that rejects UPDATE and
  DELETE. Not by convention.
- RLS enabled with a permissive policy and a comment naming M8 as where it gets tightened
  (D-011).
- Import script reads `colony.json` + `seed/plot-status-seed.csv`, validates that every
  `svg_id` matches a path in the SVG, and refuses to import if any is unmatched.
- **Refuse any manifest whose `colony.verified` is not `true`.** `colony-pipeline` marks
  automatic output as a draft; only a human pass in its verify page flips the flag
  (colony-pipeline D-108). Enforcing it on this side too means a hand-copied file cannot
  bypass it.
- `apps/map/src/lib/colony/` binds status to the DOM by setting `data-status` on each `.plot`.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Migration applies to a clean database | `supabase db reset` — **you** run it, not Claude |
| 2 | 45 plots imported, 0 unmatched | Import script exit code and printed count |
| 2b | A manifest with `verified: false` is refused | Flip the flag in a copy; assert non-zero exit |
| 3 | An UPDATE on `plot_history` is rejected | Real SQL against the database, output pasted |
| 4 | No float money column exists | `\d plots` output pasted; every money column is `bigint` |
| 5 | All three status colours render | Manual, against the fixture |
| 6 | Full gate passes | `make verify-map && pnpm lint && pnpm test -- --run && pnpm build` |

## Non-goals

Writes of any kind. M2 is read-only — the app displays status, it does not change it.
