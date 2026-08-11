# D-015 — No photos or documents per plot in v1

**Status:** provisional — proposed and not explicitly confirmed

## Decision

No image or document upload against a plot. No Supabase Storage bucket in v1.

## Reasoning

Plot text data for an entire colony is a few hundred kilobytes — smaller than one
photograph. That is what makes the whole architecture simple: fetch everything, hold it in
memory, search instantly, work offline.

Binaries break that. Registry scans and site photos are megabytes each, which forces
decisions about what to cache offline, what to evict, how to handle a partial download, and
what a stale cached document means when the real one has been replaced. That is its own
milestone, and it should be one — not a feature smuggled into another.

## Rejected alternatives

- **Storage from the start** — the family will eventually want registry papers in one place,
  and this is genuinely useful. Rejected for v1 on scope, not on merit.
- **External links to Google Drive files** — a cheap middle path worth considering if they
  ask for it before the real feature is built. It sidesteps the offline question by simply
  not working offline, which is honest.

## Blast radius

Low. Additive when built — a bucket, a column, and a lazy-loading strategy.
