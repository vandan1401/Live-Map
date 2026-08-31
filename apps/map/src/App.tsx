import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ColonyMap } from "./components/ColonyMap";
import { ColonyPicker } from "./features/colony-picker/ColonyPicker";
import { ColonyUploadScreen } from "./features/colony-upload/ColonyUploadScreen";
import { LoginScreen } from "./features/auth/LoginScreen";
import { InstallInstructions } from "./features/pwa-install/InstallInstructions";
import { hasSeenInstallInstructions } from "./pwa/installInstructionsSeen";
import { getDisplayName, signOut } from "./lib/auth/session";
import { getBrowserDbClient } from "./lib/db/browserClient";
import { loadVerifiedColonies } from "./lib/colony/listColonies";
import { isSnapshotExpired, loadColonyList, saveColonyList } from "./pwa/offlineCache";
import { formatFreshnessLabel } from "./lib/sync/freshness";
import type { ColonyRow } from "./lib/db/types";

// A home-screen install is already the thing this screen is teaching the user to do
// (/review finding #2) — showing it again on the installed app's first launch (a fresh
// context with no shared localStorage from Safari on iOS) would ask an already-installed
// user to install again.
function isStandaloneDisplay(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

// Mirrors attachSync.ts's FRESHNESS_TICK_MS — the offline colony-list label needs the
// same "advance every so often without a wasteful re-render loop" tick (/review finding
// #1: this label was frozen at its first-paint value before).
const COLONY_LIST_FRESHNESS_TICK_MS = 15_000;

function App() {
  // Created once, for the whole app lifetime (docs/plans/09.md) — lifted out of
  // ColonyMap.tsx's per-mount effect so App.tsx can check for a session before any
  // colony is even picked. Reused by ColonyMap/PlotDetailSheet as a prop, same pattern
  // that already existed one level down. null only if env vars are missing (moved here
  // from ColonyMap.tsx's own try/catch, same degrade-gracefully behaviour).
  const [client] = useState(() => {
    try {
      return getBrowserDbClient();
    } catch (error) {
      console.error("failed to create Supabase client:", error);
      return null;
    }
  });
  // undefined = still checking for a session on mount; null = no session (show
  // LoginScreen); a Session = signed in. Distinguishing "checking" from "no session"
  // avoids a one-frame flash of the login screen on a page that's actually about to
  // restore a valid session from storage.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [showInstallInstructions, setShowInstallInstructions] = useState(
    () => !hasSeenInstallInstructions() && !isStandaloneDisplay(),
  );
  const [colonies, setColonies] = useState<ColonyRow[] | null>(null);
  // docs/plans/11.md, D-025 — the colony-upload overlay, opened from ColonyPicker's
  // "Upload a colony" button, same sibling-overlay pattern as showInstallInstructions.
  const [showUpload, setShowUpload] = useState(false);
  // Separate from `colonies === []` on purpose — a fetch failure (DB down, missing env
  // vars) must not read as "the family owns no colonies" (/review finding: this is the
  // same no-data-vs-no-results confusion PlotSearch.tsx and ColonyMap.tsx already had to
  // fix once each).
  const [loadError, setLoadError] = useState(false);
  const [selectedColonyId, setSelectedColonyId] = useState<string | null>(null);
  // Set only when `colonies` came from the offline cache — drives the freshness label
  // ColonyPicker renders (/review finding #3). null means "this is live data".
  const [colonyListSavedAt, setColonyListSavedAt] = useState<string | null>(null);
  // Ticked while colonyListSavedAt is set, purely to force the freshness label to
  // re-render as its age advances (/review finding #1) — not read anywhere else.
  const [freshnessNow, setFreshnessNow] = useState(() => new Date());

  useEffect(() => {
    if (!client) {
      setSession(null);
      return;
    }
    client.auth.getSession().then(({ data }) => setSession(data.session));
    // Reacts to sign-in, sign-out (including the TTL check below calling signOut()
    // itself), and a failed token refresh (e.g. a revoked account) — any of these
    // updates `session`, which drives the LoginScreen/picker/map gate below.
    const { data: subscription } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, [client]);

  // Lifted out of the loading effect (docs/plans/11.md) so ColonyUploadScreen's onClose
  // can trigger the same refetch a reconnect does, rather than duplicating this logic —
  // a freshly uploaded colony must appear in the picker without a manual reload.
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

  if (!client) {
    return (
      <div className="colony-picker-overlay">
        <p className="colony-picker-empty">Could not connect. Check your setup.</p>
      </div>
    );
  }

  // undefined = still checking for an existing session — render nothing rather than
  // flash the login screen for a page about to restore a valid one.
  if (session === undefined) return null;

  if (session === null) {
    return <LoginScreen client={client} />;
  }

  const actor = getDisplayName(session);
  if (actor === null) {
    // A session with no usable identity (no app_metadata.display_name, no email) is
    // one this app refuses to trust rather than papering over with a placeholder
    // (docs/plans/09.md — the exact `?? "unknown"` mistake tier-1.md warns against).
    void signOut(client);
    return <LoginScreen client={client} />;
  }

  if (showInstallInstructions) {
    return <InstallInstructions onDismiss={() => setShowInstallInstructions(false)} />;
  }

  // A cached list already on screen must never be replaced by this terminal error —
  // only shown when there is truly nothing to fall back to (/review finding #1, third
  // pass: a transient failure in the online reconnect refetch was overwriting a working
  // offline picker with "Could not load colonies", which is strictly worse than staying
  // offline).
  if (loadError && !colonies) {
    return (
      <div className="colony-picker-overlay">
        <p className="colony-picker-empty">Could not load colonies. Check your connection.</p>
      </div>
    );
  }

  if (!colonies) return null;

  if (showUpload) {
    return (
      <ColonyUploadScreen
        client={client}
        onClose={() => {
          setShowUpload(false);
          fetchColonies();
        }}
      />
    );
  }

  if (!selectedColonyId) {
    // `navigator.onLine` here, not a hardcoded `false` — the network can come back while
    // colonyListSavedAt is still set (a reconnect refetch can fail transiently), and the
    // label must not keep insisting "Offline" once the connection is genuinely live.
    const freshnessLabel = colonyListSavedAt
      ? formatFreshnessLabel(new Date(colonyListSavedAt), freshnessNow, navigator.onLine)
      : undefined;
    return (
      <ColonyPicker
        colonies={colonies}
        onSelect={setSelectedColonyId}
        onUpload={() => setShowUpload(true)}
        onLogout={() => void signOut(client)}
        freshnessLabel={freshnessLabel}
      />
    );
  }

  // The colony is always present in this already-loaded, already-verified list by
  // construction of how selectedColonyId gets set (ColonyPicker only ever offers an id
  // from `colonies`) — no separate fetch needed for the SVG (docs/plans/11.md).
  const selectedColony = colonies.find((colony) => colony.id === selectedColonyId)!;

  return (
    <ColonyMap
      client={client}
      actor={actor}
      colonyId={selectedColonyId}
      colonySvg={selectedColony.svg}
      selectZoomRefWidthPx={selectedColony.select_zoom_ref_width_px ?? null}
      selectZoomRefHeightPx={selectedColony.select_zoom_ref_height_px ?? null}
      onBack={() => setSelectedColonyId(null)}
    />
  );
}

export default App;
