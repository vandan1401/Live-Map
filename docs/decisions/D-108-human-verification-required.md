# D-108 — No export is a deliverable until a human has verified it

**Status:** accepted

## Decision

Every automatic export writes `"verified": false`. Only a human clicking "Mark verified" in
the verify page sets it true. `colony-map` refuses to import an unverified manifest. There
is no code path that sets the flag.

## Reasoning

This is ownership data. Automatic detection lands somewhere between 85% and 100% depending
on input quality, and the errors are not evenly distributed — they cluster around exactly
the awkward plots that matter (corners, oversized parcels, plots next to labels).

With a fully automatic pipeline you would never be sure which category a given colony fell
into. With a mandatory human pass, a clean colony costs a minute of clicking and a messy one
surfaces its problems in a list. Automation does the boring 90%, the human handles the
interesting 10%, and every plot is confirmed before it ships.

The flag is enforced in **both** repos deliberately. A rule that lives only in the producing
tool gets bypassed the first time someone copies a file by hand.

## Rejected alternatives

- **Trust the QA gate alone** — the automatic checks catch structural problems (duplicate
  ids, unmatched labels, overlaps) but cannot catch a label confidently assigned to the
  wrong polygon, which is the failure that matters most.
- **Verification as a warning** — a warning that lets output through teaches the human to
  ignore it.

## Blast radius

Cross-repo. Removing this on one side without the other creates a false sense of safety.
