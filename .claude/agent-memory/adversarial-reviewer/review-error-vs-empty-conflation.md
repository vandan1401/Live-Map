---
name: review-error-vs-empty-conflation
description: 4x in apps/map — a fetch/network failure rendered as the same screen as a legitimate "no data / invalid data" result; check every catch block's message against what a thrown error actually proves.
metadata:
  type: feedback
---

In `apps/map`, a rejected promise and a legitimately empty/negative result keep landing in the
same UI branch. Every occurrence so far was found in review, never by a test.

**Why:** this app's users are a family plus (from plan 22) prospective buyers. "No colonies",
"no search results", "this link is revoked" are all statements of *fact* about the data; a
`catch` that renders them turns a flaky network into a false statement the user acts on
(calls the owner, assumes the link is dead, assumes a plot is unsold).

Occurrences:
1. `PlotSearch.tsx` — no-data vs no-results, fixed once.
2. `ColonyMap.tsx` — same, fixed once.
3. `App.tsx:57-61` — `loadError` state added specifically so a fetch failure could not read as
   "the family owns no colonies"; later needed a second fix (`App.tsx:186-197`,
   `loadError && !colonies`) so a transient refetch failure could not replace a working
   offline list with the terminal error screen.
4. 2026-08-31, plan 22 — `features/public-colony/PublicColonyView.tsx:27-29, 56-62`:
   `.catch(() => setResult("error"))` renders "This link is invalid or has been revoked",
   the same string as a genuine `found: false`. The app shell is service-worker cached, so an
   offline visitor reliably gets the *wrong* sentence. The comment above it justifies the
   merge with the plan's token-ambiguity constraint, which only governs the RPC's
   found/not-found response — see [[review-comment-asserts-unimplemented]] #8.

**How to apply:** for every new `.catch(...)` / `try` in a component, read the string it
ultimately renders and ask what the thrown error *proves*. If the message asserts something
about the data (empty, invalid, revoked, unsold) rather than about the attempt (couldn't
load, check your connection), that is a finding. Four occurrences is enough to be worth a
CLAUDE.md line — recommend it, don't just re-flag it. Related: [[review-optimistic-defaults]].
