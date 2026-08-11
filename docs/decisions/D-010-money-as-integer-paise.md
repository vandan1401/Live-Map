# D-010 — Money stored as integer paise

**Status:** accepted

## Decision

Every monetary value is an integer count of paise at every layer: Postgres `bigint`, the
TypeScript type, the JSON payload, and application state. Names end in `_paise`. Rupees
appear only in the render formatter.

## Reasoning

Floating-point arithmetic does not represent decimal fractions exactly. `0.1 + 0.2` is
`0.30000000000000004`. A rate stored as a float and multiplied by an area is wrong by an
amount too small to notice in testing and too large to ignore once it reaches a receipt or a
commission calculation.

The naming convention is not cosmetic — `rate_paise` makes a float assignment visible at
the call site, where a plain `rate` would not.

## Rejected alternatives

- **Postgres `numeric`** — exact, and a legitimate choice. Rejected because it arrives in
  JavaScript as a string or a lossy number depending on the driver, so the boundary needs
  careful handling anyway; integers avoid the question entirely.
- **Float rupees** — the default anyone reaches for. Rejected outright.
- **A decimal library** — a dependency and a wrapper type for a problem integers already
  solve.

## Blast radius

High if changed later: a migration plus every read and write path.
