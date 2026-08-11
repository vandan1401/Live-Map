# D-107 — Overrides keyed by rounded centroid, reapplied every run

**Status:** accepted

## Decision

Hand-made corrections live in `overrides/<colony>.json`, keyed by rounded centroid, and are
reapplied after matching and before export on every run.

## Reasoning

The failure this prevents is silent and delayed: you correct six plots, improve a detection
heuristic a week later, rerun, and the corrections are gone. You do not notice until one of
those plots shows the wrong owner in the app.

Centroid is the right key because it is the only identifier stable across code changes.
Array index changes when detection order changes. A generated id changes when matching
changes. Both are unstable at exactly the moment overrides matter most — after you improved
the thing that was getting it wrong.

An override whose key matches no polygon is **reported loudly, never dropped**. That means
geometry moved and a human needs to look. Silently discarding it would reintroduce the
original failure through the back door.

## Rejected alternatives

- **Keyed by array index** — trivial, and breaks on the first reorder.
- **Keyed by plot id** — reads better, but the id is the thing being corrected.
- **Bake corrections into the output and never rerun** — makes every code improvement a
  choice between better detection and keeping existing work.

## Blast radius

High if wrong, and the damage is invisible. This is why `pipeline/overrides/` is Tier 1 and
why the guard hook blocks deleting these files.
