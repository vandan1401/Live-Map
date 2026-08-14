import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlotStatuses } from "../colony/plotStatus.ts";
import { subscribePlotChanges, type SyncConnectionStatus } from "./subscribePlots.ts";
import { formatFreshnessLabel } from "./freshness.ts";
import { loadSnapshot, saveSnapshot } from "../../pwa/offlineCache.ts";
import type { PlotStatus } from "../db/types.ts";

// Not specified by spec/05 — chosen so a human watching the indicator for 5 minutes
// (M5 acceptance criterion 2) sees the label visibly advance several times without a
// wasteful sub-second re-render loop.
const FRESHNESS_TICK_MS = 15_000;

interface Callbacks {
  applyStatuses: (statuses: Record<string, PlotStatus>) => void;
  applyStatus: (svgId: string, status: PlotStatus) => void;
  setOffline: (offline: boolean) => void;
  setFreshnessLabel: (label: string) => void;
}

// Wires the realtime subscription, the offline/online + channel-status signals, the
// reconnect-refetch, and the freshness tick into one cleanup-able unit (spec/05).
// Framework-free by design — the caller (ColonyMap.tsx) supplies state setters and owns
// the actual DOM writes via applyStatuses/applyStatus, same as it already did before M5.
// Reuses loadPlotStatuses (lib/colony/plotStatus.ts) rather than lib/db directly —
// NAVIGATION.md's layer table doesn't sanction Sync importing Domain, but ColonyMap.tsx
// already crosses this same boundary (see PROGRESS.md Deferred); calling the existing
// domain-shaped function beat introducing a second, dead wrapper around lib/db.
export function attachSync(
  client: SupabaseClient,
  colonyId: string,
  callbacks: Callbacks,
): () => void {
  const { applyStatuses, applyStatus, setOffline, setFreshnessLabel } = callbacks;

  let cancelled = false;
  // null until the first successful sync — must never be seeded eagerly, or a failed
  // initial fetch leaves the indicator claiming freshness that never happened.
  let lastSyncedAt: Date | null = null;
  // Mirrors whatever's currently applied to the DOM — kept so onChange (a single-plot
  // realtime event) can persist a full-colony snapshot rather than needing its own fetch
  // (/review finding #1: without this, the offline cache never recorded a realtime
  // update — including the user's own Save echoed back — so a booking made just before
  // going offline would silently revert to "available" on reopen).
  let latestStatuses: Record<string, PlotStatus> | null = null;
  let browserOnline = navigator.onLine;
  // Optimistic true — avoids a false "Offline" flash while the channel is still in the
  // process of subscribing on a healthy connection; corrected the moment the first real
  // onStatusChange event arrives.
  let channelConnected = true;
  let wasOffline = false;
  let offline = false;

  const recomputeFreshnessLabel = () => {
    setFreshnessLabel(
      lastSyncedAt ? formatFreshnessLabel(lastSyncedAt, new Date(), !offline) : "Not synced yet",
    );
  };

  const markSynced = () => {
    lastSyncedAt = new Date();
    recomputeFreshnessLabel();
  };

  const recomputeOffline = () => {
    const nextOffline = !browserOnline || !channelConnected;
    offline = nextOffline;
    setOffline(nextOffline);
    recomputeFreshnessLabel();
    // Reconnect handling (spec/05): refetch the whole colony rather than trusting that
    // no realtime events were missed while disconnected — a missed event is invisible
    // and permanent. Only fires on a genuine offline->online transition.
    if (wasOffline && !nextOffline) {
      loadPlotStatuses(client, colonyId)
        .then((statuses) => {
          if (cancelled) return;
          applyStatuses(statuses);
          markSynced();
          latestStatuses = statuses;
          saveSnapshot(colonyId, statuses).catch((error: unknown) => {
            console.error("offline snapshot save failed:", error);
          });
        })
        .catch((error: unknown) => {
          console.error("reconnect refetch failed:", error);
        });
    }
    wasOffline = nextOffline;
  };
  // Seeds offline/wasOffline from the real navigator.onLine signal — without this,
  // mounting while already offline would render the online phrasing, and the later
  // "online" event would never be recognised as a transition.
  recomputeOffline();

  const handleOnline = () => {
    browserOnline = true;
    recomputeOffline();
  };
  const handleOffline = () => {
    browserOnline = false;
    recomputeOffline();
  };
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Opened immediately, independent of the initial fetch below — if that fetch fails,
  // the app must not go permanently blind to other users' writes for the rest of the
  // mount.
  const unsubscribeRealtime = subscribePlotChanges(client, colonyId, {
    onChange: (svgId, status) => {
      if (cancelled) return;
      applyStatus(svgId, status);
      markSynced();
      if (latestStatuses) {
        latestStatuses = { ...latestStatuses, [svgId]: status };
        saveSnapshot(colonyId, latestStatuses).catch((error: unknown) => {
          console.error("offline snapshot save failed:", error);
        });
      }
    },
    onStatusChange: (status: SyncConnectionStatus) => {
      if (cancelled) return;
      channelConnected = status === "connected";
      recomputeOffline();
    },
  });

  loadPlotStatuses(client, colonyId)
    .then((statuses) => {
      if (cancelled) return;
      applyStatuses(statuses);
      markSynced();
      latestStatuses = statuses;
      saveSnapshot(colonyId, statuses).catch((error: unknown) => {
        console.error("offline snapshot save failed:", error);
      });
    })
    .catch((error: unknown) => {
      console.error("failed to load plot statuses:", error);
      // Offline reads (D-008, spec/07): the initial fetch has no reconnect retry of its
      // own, so a cold, offline open must fall back to the last saved snapshot rather
      // than leaving the map blank. lastSyncedAt is set from the snapshot's own savedAt,
      // never "now" — the freshness label must say when the data was actually current.
      if (navigator.onLine) return;
      loadSnapshot(colonyId)
        .then((snapshot) => {
          // lastSyncedAt is only ever set by a real sync (markSynced/reconnect refetch,
          // above) — if one already landed while this read was in flight, that's live
          // data and must win; a stale snapshot must never overwrite it (/review finding
          // #3: this used to be the one place plan 07 §6.3's "Concurrency — N/A" didn't
          // hold).
          if (cancelled || !snapshot || lastSyncedAt) return;
          applyStatuses(snapshot.statuses);
          lastSyncedAt = new Date(snapshot.savedAt);
          latestStatuses = snapshot.statuses;
          recomputeFreshnessLabel();
        })
        .catch((offlineError: unknown) => {
          console.error("offline snapshot load failed:", offlineError);
        });
    });

  const freshnessInterval = setInterval(recomputeFreshnessLabel, FRESHNESS_TICK_MS);

  return () => {
    cancelled = true;
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    unsubscribeRealtime();
    clearInterval(freshnessInterval);
  };
}
