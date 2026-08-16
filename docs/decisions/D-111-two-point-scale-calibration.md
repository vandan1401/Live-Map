# D-111 — Scale recovered by two-point calibration

**Status:** superseded by D-118 - `px_per_ft` is asserted in the colony config and checked
against a known plot, not calibrated by clicking.

## Decision

`px_per_ft` is derived by clicking two points on the drawing — a scale bar, or any known
dimension — and typing the real distance. Not read from CAD units.

## Reasoning

Real-world units were the strongest remaining argument for a DXF path. This removes it for
about thirty seconds of work, once per colony.

It also works on *every* input: vector PDF, scan, or a photograph of a printed plan. A
CAD-derived scale works on exactly one of those, and even then depends on `$INSUNITS` being
set correctly, which it frequently is not.

Areas matter here — `area_sqft` is a field the family reads and quotes — so the calibration
needs to be visible and correctable rather than inferred silently.

## Rejected alternatives

- **Read units from DXF `$INSUNITS`** — exact when present and correct, absent or wrong
  often enough to need a fallback anyway.
- **Ask the user to type `px_per_ft` directly** — nobody knows that number.
- **Infer from typical plot size** — circular: plot size is what you are trying to compute.

## Blast radius

Low. One value per colony, stored in the manifest under `scale`.
