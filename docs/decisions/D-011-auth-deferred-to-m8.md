# D-011 — Auth deferred to M8; no public deployment before it

**Status:** accepted

## Decision

Authentication is the last milestone, not the first. Milestones M1–M7 run against permissive
row-level security with the anon key granting full read and write. The app must not be
deployed to any public URL until M8 ships. `.claude/hooks/guard.sh` blocks
`wrangler pages deploy` to enforce this.

## Reasoning

Requested by the owner, and defensible: auth is well-understood, contained to `src/lib/auth/`
plus the RLS policies, and adds a login wall to every manual test during development. Doing
it last gets the map, the writes, and the realtime sync — the parts with genuine unknowns —
in front of the family sooner.

The risk is not the deferral. The risk is **forgetting** the deferral and deploying, at which
point a URL leak exposes ownership records to anyone who has it. That is why this is enforced
by a hook rather than stated in prose: a rule in a document drifts over a long project, and
this one cannot be allowed to.

## Rejected alternatives

- **Auth first (M2)** — the conventional order and safer by default. Rejected on the owner's
  explicit instruction.
- **Auth deferred with only a documented warning** — rejected. Documentation is not
  enforcement, and the failure is silent and unrecoverable once the data is out.

## Blast radius

Contained, provided the deploy block holds. M8 must remove the block, mark this superseded,
and only then allow a real URL.
