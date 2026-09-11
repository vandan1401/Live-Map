import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { loadVerifiedColonies } from "./listColonies";
import { isSnapshotExpired, loadColonyList, saveColonyList } from "../../pwa/offlineCache";
import { signOut } from "../auth/session";
import type { ColonyRow } from "../db/types";

// Mirrors attachSync.ts's FRESHNESS_TICK_MS — the offline colony-list label needs the
// same "advance every so often without a wasteful re-render loop" tick (/review finding
// #1: this label was frozen at its first-paint value before).
const COLONY_LIST_FRESHNESS_TICK_MS = 15_000;

// The verified-colony list, its offline-cache fallback, and the freshness label's ticking
// clock — split out of App.tsx purely to stay under invariant 7's 250-line cap (same
// reason useOrgName.ts/useCornerPlots.ts were split out), not because this needed its own
// module for any other reason.
export function useColonyList(client: SupabaseClient | null, session: Session | null | undefined) {
  const [colonies, setColonies] = useState<ColonyRow[] | null>(null);
  // Separate from `colonies === []` on purpose — a fetch failure (DB down, missing env
  // vars) must not read as "the family owns no colonies" (/review finding: this is the
  // same no-data-vs-no-results confusion PlotSearch.tsx and ColonyMap.tsx already had to
  // fix once each).
  const [loadError, setLoadError] = useState(false);
  // Set only when `colonies` came from the offline cache — drives the freshness label
  // ColonyPicker renders (/review finding #3). null means "this is live data".
  const [colonyListSavedAt, setColonyListSavedAt] = useState<string | null>(null);
  // Ticked while colonyListSavedAt is set, purely to force the freshness label to
  // re-render as its age advances (/review finding #1) — not read anywhere else.
  const [freshnessNow, setFreshnessNow] = useState(() => new Date());

  // Exposed so ColonyUploadScreen's onClose can trigger the same refetch a reconnect does,
  // rather than duplicating this logic — a freshly uploaded colony must appear in the
  // picker without a manual reload.
  const fetchColonies = useCallback(() => {
    if (!client) return;
    loadVerifiedColonies(client)
      .then((loaded) => {
        setColonies(loaded);
        setColonyListSavedAt(null);
        // /review finding #1 (second pass): the reconnect refetch above only means
        // anything if a prior failure's setLoadError(true) gets cleared here — without
        // this, a first-ever offline open with no snapshot stays stuck on the error
        // screen forever, even once the network is back and this call has succeeded.
        setLoadError(false);
        saveColonyList(loaded).catch((error: unknown) => {
          console.error("offline colony list save failed:", error);
        });
      })
      .catch((error: unknown) => {
        console.error("failed to load colony list:", error);
        // Offline reads (D-008, spec/07): a cold, offline open must show the
        // last-known colony list rather than the "check your connection" error —
        // that message is for a real online failure, not an expected offline state.
        if (!navigator.onLine) {
          loadColonyList()
            .then((snapshot) => {
              if (!snapshot) {
                setLoadError(true);
                return;
              }
              // Cache TTL (docs/plans/09.md, spec/08 criterion 5): data older than 24h
              // is never rendered — forces re-auth by signing the (possibly revoked)
              // session out rather than trusting stale data indefinitely.
              if (isSnapshotExpired(snapshot.savedAt, new Date())) {
                void signOut(client);
                setLoadError(true);
                return;
              }
              setColonies(snapshot.colonies);
              setColonyListSavedAt(snapshot.savedAt);
              setLoadError(false);
            })
            .catch(() => setLoadError(true));
          return;
        }
        setLoadError(true);
      });
  }, [client]);

  useEffect(() => {
    if (!client || !session) return;

    fetchColonies();

    // Reconnect handling, same shape as attachSync.ts's (spec/05): a cached list must
    // not sit there silently once the network is back — refetch and drop back to live
    // data the moment "online" fires (/review finding #1).
    window.addEventListener("online", fetchColonies);
    return () => window.removeEventListener("online", fetchColonies);
  }, [client, session, fetchColonies]);

  useEffect(() => {
    if (colonyListSavedAt === null) return;
    const interval = setInterval(() => setFreshnessNow(new Date()), COLONY_LIST_FRESHNESS_TICK_MS);
    return () => clearInterval(interval);
  }, [colonyListSavedAt]);

  return { colonies, loadError, colonyListSavedAt, freshnessNow, fetchColonies };
}
