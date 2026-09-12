import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ColonyMap } from "./components/ColonyMap";
import { LoadingScreen } from "./components/LoadingScreen";
import { MapLoadingScreen } from "./components/MapLoadingScreen";
import { ColonyPicker } from "./features/colony-picker/ColonyPicker";
import { ColonyUploadScreen } from "./features/colony-upload/ColonyUploadScreen";
import { LoginScreen } from "./features/auth/LoginScreen";
import { PublicColonyView } from "./features/public-colony/PublicColonyView";
import { InstallInstructions } from "./features/pwa-install/InstallInstructions";
import { hasSeenInstallInstructions, isStandaloneDisplay } from "./pwa/installInstructionsSeen";
import { getDisplayName, signOut } from "./lib/auth/session";
import { getBrowserDbClient } from "./lib/db/browserClient";
import { useOrgName } from "./lib/colony/useOrgName";
import { useColonyList } from "./lib/colony/useColonyList";
import { useColonyOpenSplash } from "./lib/colony/useColonyOpenSplash";
import { parsePublicToken } from "./lib/colony/publicLinkUrl";
import { formatFreshnessLabel } from "./lib/sync/freshness";

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
  // docs/plans/11.md, D-025 — the colony-upload overlay, opened from ColonyPicker's
  // "Upload a colony" button, same sibling-overlay pattern as showInstallInstructions.
  const [showUpload, setShowUpload] = useState(false);
  const [selectedColonyId, setSelectedColonyId] = useState<string | null>(null);
  const { openToken, showSplash, bumpOpen, finishSplash } = useColonyOpenSplash();

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

  const { colonies, loadError, colonyListSavedAt, freshnessNow, fetchColonies } = useColonyList(
    client,
    session,
  );
  const orgName = useOrgName(client, session);

  if (!client) {
    return (
      <div className="colony-picker-overlay">
        <p className="colony-picker-empty">Could not connect. Check your setup.</p>
      </div>
    );
  }

  // docs/plans/22.md phase 2: a public link never needs a session — checked before every
  // authenticated-path branch below (see lib/colony/publicLinkUrl.ts for the URL scheme).
  const publicToken = parsePublicToken(window.location.hash);
  if (publicToken) return <PublicColonyView client={client} token={publicToken} />;

  // undefined = still checking for an existing session — a branded splash rather than
  // flashing the login screen for a page about to restore a valid one.
  if (session === undefined) return <LoadingScreen />;

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

  if (!colonies) return <LoadingScreen />;

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
        orgName={orgName}
        onSelect={(id) => {
          setSelectedColonyId(id);
          bumpOpen();
        }}
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
    <>
      <ColonyMap
        client={client}
        actor={actor}
        colonyId={selectedColonyId}
        colonySvg={selectedColony.svg}
        selectZoomRefWidthPx={selectedColony.select_zoom_ref_width_px ?? null}
        selectZoomRefHeightPx={selectedColony.select_zoom_ref_height_px ?? null}
        colonyBackdropFields={selectedColony}
        onBack={() => setSelectedColonyId(null)}
      />
      {showSplash && (
        // Mounted on top of the already-rendering ColonyMap above, which is already sitting
        // at its real final view underneath (owner ask, 2026-09-12: no map-side zoom at all —
        // the map never moves, the splash is the only thing animating).
        <MapLoadingScreen
          key={openToken}
          colonyName={selectedColony.name}
          colonyId={selectedColonyId}
          ready
          onFinish={finishSplash}
        />
      )}
    </>
  );
}

export default App;
