---
name: review-optimistic-defaults
description: Recurring defect — initial/default state that asserts an unverified fact (fresh, connected, attributed) so the UI shows a healthy state that was never confirmed. Same family as attribution fallbacks.
metadata:
  type: feedback
---

In every diff, check what the *initial* value of a state/ref claims. If the default asserts
something the code has not yet verified — "synced", "connected", "verified", an actor name —
that is a finding, even when the happy path immediately overwrites it. Ask: what does the
screen say if the very first fetch/connect never succeeds?

**Why:** this repo's whole product argument is that the app must be more honest than the
WhatsApp PDF it replaces (`spec/05`, `.claude/rules/tier-1.md` "Cache and freshness":
*"Data rendered without a visible age is the failure mode that kills adoption"*). A default
that reads like success turns a dead connection into a confident lie, and there is no error
path to notice it — the same shape as [[review-attribution-fallbacks]], where a `?? "unknown"`
default forged evidence.

Occurrences so far:
1. 2026-08-13 / 2026-08-14 — actor fallbacks (`?? "import"`, `?? "unknown"`), see
   [[review-attribution-fallbacks]].
2. 2026-08-13 (M5 review) — `ColonyMap.tsx`: `lastSyncedAtRef = useRef(new Date())` and
   `useState("Updated just now")` seeded at mount, plus `offline`/`offlineRef`/`wasOfflineRef`
   all seeded `false` while `browserOnlineRef` read the real `navigator.onLine`. A failed
   initial `loadPlotStatuses` (DB down, mount while offline) left the indicator counting up
   from mount time on data that never arrived, and made the offline→online reconnect refetch
   unreachable.

**How to apply:** the fix is a nullable initial value plus an explicit "not yet" render
("Not synced yet"), or deriving initial state from the real signal at effect start rather
than a hopeful literal. Related: [[review-vacuous-acceptance-tests]].
