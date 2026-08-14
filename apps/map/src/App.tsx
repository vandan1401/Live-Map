import { useEffect, useState } from "react";
import { ColonyMap } from "./components/ColonyMap";
import { ColonyPicker } from "./features/colony-picker/ColonyPicker";
import { NamePrompt } from "./features/identity/NamePrompt";
import { InstallInstructions } from "./features/pwa-install/InstallInstructions";
import { hasSeenInstallInstructions } from "./pwa/installInstructionsSeen";
import { getStoredActor, setStoredActor } from "./lib/identity/actor";
import { getBrowserDbClient } from "./lib/db/browserClient";
import { loadVerifiedColonies } from "./lib/colony/listColonies";
import { loadColonyList, saveColonyList } from "./pwa/offlineCache";
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
  const [actor, setActor] = useState(() => getStoredActor());
  const [showInstallInstructions, setShowInstallInstructions] = useState(
    () => !hasSeenInstallInstructions() && !isStandaloneDisplay(),
  );
  const [colonies, setColonies] = useState<ColonyRow[] | null>(null);
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
    if (!actor) return;

    const fetchColonies = () => {
      loadVerifiedColonies(getBrowserDbClient())
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
                if (snapshot) {
                  setColonies(snapshot.colonies);
                  setColonyListSavedAt(snapshot.savedAt);
                  setLoadError(false);
                } else {
                  setLoadError(true);
                }
              })
              .catch(() => setLoadError(true));
            return;
          }
          setLoadError(true);
        });
    };

    fetchColonies();

    // Reconnect handling, same shape as attachSync.ts's (spec/05): a cached list must
    // not sit there silently once the network is back — refetch and drop back to live
    // data the moment "online" fires (/review finding #1).
    window.addEventListener("online", fetchColonies);
    return () => window.removeEventListener("online", fetchColonies);
  }, [actor]);

  useEffect(() => {
    if (colonyListSavedAt === null) return;
    const interval = setInterval(() => setFreshnessNow(new Date()), COLONY_LIST_FRESHNESS_TICK_MS);
    return () => clearInterval(interval);
  }, [colonyListSavedAt]);

  if (!actor) {
    return (
      <NamePrompt
        onSubmit={(name) => {
          setStoredActor(name);
          setActor(name);
        }}
      />
    );
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

  if (!selectedColonyId) {
    // `navigator.onLine` here, not a hardcoded `false` — the network can come back while
    // colonyListSavedAt is still set (a reconnect refetch can fail transiently), and the
    // label must not keep insisting "Offline" once the connection is genuinely live.
    const freshnessLabel = colonyListSavedAt
      ? formatFreshnessLabel(new Date(colonyListSavedAt), freshnessNow, navigator.onLine)
      : undefined;
    return (
      <ColonyPicker colonies={colonies} onSelect={setSelectedColonyId} freshnessLabel={freshnessLabel} />
    );
  }

  return <ColonyMap actor={actor} colonyId={selectedColonyId} />;
}

export default App;
