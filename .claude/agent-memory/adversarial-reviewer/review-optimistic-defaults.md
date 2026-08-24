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

3. 2026-08-14 (plan 06 colony picker) — `App.tsx`'s `loadVerifiedColonies(...).catch(() =>
   setColonies([]))`. The *mirror image* of the same bug: a fetch failure is written into
   state as a legitimate empty result, so a dead DB renders "No colonies yet." — the app
   states as fact that the family owns no colonies. The repo already fixed this exact shape
   twice in `PlotSearch.tsx` (`indexLoaded` distinguishes "never got data" from "zero
   matches") and in `ColonyMap.tsx`'s `setClient` mirror comment. **So also check the catch
   block, not just the initial value:** any `catch` that sets a valid-looking empty/zero
   value is the same finding.

4. 2026-08-14 (plan 07, M7 PWA) — the *third* shape of the same bug: cached data rendered
   with **no age at all**. `offlineCache.ts` stores `ColonyListSnapshot.savedAt`, and
   `App.tsx`'s offline fallback does `setColonies(snapshot.colonies)` while `savedAt` is
   never read anywhere in `src/`. The colony picker looks byte-identical online and after
   a week offline. Plan 07 §3 had pinned "cached data must never render without its age"
   and §6.5 had claimed no dead computation — both false in the same two lines.
   **Check: for every persisted snapshot, grep whether its timestamp field is ever read.**

5. 2026-08-14 (plan 07, second pass) — the *frozen* freshness label. `App.tsx` now renders
   the cached colony list's age, but computes it inline during render with `online`
   hardcoded `false`, in a component whose only effect depends on `[actor]`. Nothing ticks
   it and nothing refetches on reconnect, so the picker keeps asserting "Offline — last
   synced 3h ago" hours later and while genuinely online. `attachSync.ts` gets this right
   (`setInterval(recomputeFreshnessLabel)` + `online`/`offline` listeners + reconnect
   refetch) — **any second freshness surface must copy that trio, not just call
   `formatFreshnessLabel` once.** A label that was honest at first paint and never updates
   is the same lie as one that was never true.

6. 2026-08-14 (plan 07, third pass) — the *inverse*: a terminal error flag nothing can clear.
   `App.tsx`'s `loadError` is only ever `setLoadError(true)`, and the render checks it before
   `colonies`. The same diff added a `window.addEventListener("online", fetchColonies)` whose
   comment promises "drop back to live data the moment 'online' fires" — but a successful
   refetch sets `colonies` under an error screen that never goes away. **Check: for every
   boolean error/empty/loading flag, grep for its `set…(false)`. If a diff adds a retry,
   reconnect, or refetch path, that path must clear every flag the failure set.** A retry
   that cannot repaint is dead computation dressed as resilience.

7. 2026-08-14 (plan 07, fourth pass) — the rule held on the *main* path and was dropped on
   the *branches*. Two shapes in one diff: (a) `ColonyPicker.tsx`'s `colonies.length === 0`
   early return renders "No colonies yet." and never renders the `freshnessLabel` prop the
   same component renders below it — a cached empty list (realistic here: D-108 means the
   verified list is legitimately empty until a human verifies a colony) shows with no age;
   (b) `attachSync.ts` calls `saveSnapshot` on the initial fetch and the reconnect refetch
   but **not** in the realtime `onChange` handler, so every status change after mount —
   including the user's own Save, echoed back via `postgres_changes` — is absent from the
   offline snapshot. **Check both directions: for every early-return/alternate render
   branch, does it still show the age? And for every path that mutates the data, does it
   also write the cache?** A guarantee enforced on one of three write paths is not enforced.

8. 2026-08-14 (plan 07, fifth pass) — the *fix for #6 created its mirror*. `setLoadError(false)`
   now runs on success, but the failure path still runs `setLoadError(true)` unconditionally,
   and `App.tsx` renders `if (loadError)` **before** `if (!colonies)`. So when the reconnect
   `online` listener fires and that refetch fails transiently (`navigator.onLine` is true, so
   no offline fallback), a working cached colony list is replaced by a terminal
   "Could not load colonies" screen with no further retry — reconnecting makes the app
   strictly worse than staying offline. **Check: when a refetch fails, does the failure path
   discard data the user could still be shown? Render errors only when there is nothing
   cached (`loadError && !colonies`), and re-check any `online`-hardcoded freshness argument
   once cached data can render while online.**

9. 2026-08-16 (plan 10, table view) — the *ninth* shape: a **new component that mirrors an
   existing one drops the original's error handling**. `features/plot-table/PlotTableView.tsx`
   was explicitly specified as "mirror `PlotStatusActions.tsx`/`PlotDetailSheet.tsx`", but its
   `handleSave` has no `try/catch/finally` (the original has all three) — `applyPlotTransition`
   *throws* on network/unknown-Postgres errors, so the rejection is unhandled and
   `saving: true` is never cleared: the row's select, input and Save button stay disabled with
   no message. Same file, `onStatusChange: () => {}` stubs out the connection signal, so the
   reconnect refetch `attachSync.ts` implements (tier-1.md "Cache and freshness") does not
   exist for this second data surface. **Check: when a diff says "mirrors X", diff it against
   X clause by clause — catch blocks, `finally`, and every callback the shared primitive
   offers. A handler body of `() => {}` on a Tier-1 sync/error primitive is a finding.**

10. 2026-08-17 (plan 11, colony upload) — the *tenth* shape: **a confirmation flag that stays
    ticked across a stage change into a more destructive action**. `ColonyUploadScreen.tsx`
    resets `confirmed` before the `ready` stage but not before `exists`, and the `exists`
    stage reuses the same `confirmed` state for its "Replace this colony's geometry" checkbox
    — so the second gate arrives pre-ticked and the destructive button enabled, from the
    first gate's click. **Check: for every multi-step confirm flow, each stage that reuses a
    shared boolean must reset it on entry; grep every `setStage(` for a matching reset.**

11. 2026-08-24 (plan 19) — the *eleventh* shape: **a default value added to a new parameter so
    the compiler stops asking**. Plan 19 §2 said add `feature_labels: Sequence[Label]` to
    `build_svg` and "update every existing call site" (3 in `test_export.py`, 5 in
    `test_svg_labels.py`). The implementation wrote `feature_labels: Sequence[Label] = ()`
    instead, so `test_export.py` was never touched — including the `orchestrate_export`
    end-to-end tests, which now cannot regress on the one line that wires the feature under
    review. A default here means a future caller silently emits zero labels. **Check: when a
    plan says "update every call site", a default parameter is a deviation, not an
    equivalent — grep the call sites the plan enumerated and confirm each was edited.**

**How to apply:** the fix is a nullable initial value plus an explicit "not yet" render
("Not synced yet"), or deriving initial state from the real signal at effect start rather
than a hopeful literal. Related: [[review-vacuous-acceptance-tests]].
