# D-005 — Only plots live in Postgres; features ship as static files

**Status:** accepted

## Decision

Three tiers of map content:

| Tier | Examples | Lives in | Tappable |
|---|---|---|---|
| Stateful | plots | SVG + manifest + Postgres | Yes, full detail sheet |
| Static labelled | clubhouse, temple, park, tank | SVG + manifest | Yes, small info popup |
| Decoration | roads, trees, site boundary | SVG only | No |

## Reasoning

The meaningful split is stateful versus static, not roads-versus-gardens. Plots change and
need rows, history, and concurrency control. Everything else is fixed at import and never
changes, so a database row buys nothing and costs a network round trip.

Trees and roads stay out of the manifest entirely because both are derived — trees are
generated from a per-colony seed, roads are computed by subtracting everything else from the
site boundary. Storing a derived value creates a second source of truth that can disagree.

## Rejected alternatives

- **Everything in Postgres** — uniform, one loading path. Rejected: pays query cost forever
  for data that is identical on every load.
- **Everything static including plot status** — would make the app read-only, which is the
  entire feature the family asked for.

## Blast radius

Moderate. Moving a feature type between tiers later means a migration plus a manifest change.
