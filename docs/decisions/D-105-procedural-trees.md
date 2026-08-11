# D-105 — Trees generated procedurally from a per-colony seed

**Status:** accepted

## Decision

Tree positions are computed: offset the road polygon inward, sample at intervals, apply
jitter seeded from the colony id. Never placed by hand, never stored in the manifest.

## Reasoning

Hand-placing decoration does not scale past one colony, and the visual goal — planting that
reads as planting rather than clip art — comes from jitter in position and radius, which is
exactly what a generator does well and a human does slowly.

Seeding from the colony id makes output **stable across runs**. That matters more than it
sounds: it is what allows the idempotency test ("two clean runs are byte-identical") to be
meaningful, and idempotency is what makes rerunning safe after a code change. With
`random()` every rerun would produce a spurious diff and the test would have to be dropped.

Trees stay out of the manifest because they are derived. Storing a derived value creates a
second source of truth that can disagree with the generator.

## Rejected alternatives

- **Hand-placed trees** — better artistic control, does not scale, and reruns lose the work.
- **No trees** — cheaper, and the map looks like a wireframe. The family are showing this to
  buyers; it should look like something they are proud of.
- **Unseeded random** — one line simpler, kills the idempotency test.

## Blast radius

Very low.
