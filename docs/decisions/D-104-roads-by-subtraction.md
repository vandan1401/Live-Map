# D-104 — Roads derived by subtraction, never extracted

**Status:** accepted

## Decision

`roads = site_boundary − union(plots, gardens, amenities, water)`. One shapely difference.
Roads are never read from the source drawing.

## Reasoning

This is the part people over-engineer. Extracting roads means handling however the
draftsman chose to draw them — centrelines, kerb pairs, hatched bands, or nothing at all,
varying by colony and by architect.

Subtraction sidesteps all of it and is always correct, because roads genuinely *are* the
negative space. It costs nothing and depends on no drawing convention.

The trade-off accepted: the main-road-versus-lane hierarchy is lost, since the result is one
undifferentiated polygon. That can be recovered later by tagging the widest connected
segment, or simply skipped — the app renders roads as quiet background, so hierarchy is
cosmetic.

## Rejected alternatives

- **Extract from a road layer** — works on a well-layered file, fails on everything else,
  and adds a per-colony configuration burden.
- **Skip roads entirely** — plots would float on blank ground, and `is_corner` and `facing`
  both need the road polygon to be computed at all.

## Blast radius

Low. Contained to `pipeline/derive/`.
