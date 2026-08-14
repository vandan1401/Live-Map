import { useEffect, useState } from "react";
import { ColonyMap } from "./components/ColonyMap";
import { ColonyPicker } from "./features/colony-picker/ColonyPicker";
import { NamePrompt } from "./features/identity/NamePrompt";
import { getStoredActor, setStoredActor } from "./lib/identity/actor";
import { getBrowserDbClient } from "./lib/db/browserClient";
import { loadVerifiedColonies } from "./lib/colony/listColonies";
import type { ColonyRow } from "./lib/db/types";

function App() {
  const [actor, setActor] = useState(() => getStoredActor());
  const [colonies, setColonies] = useState<ColonyRow[] | null>(null);
  // Separate from `colonies === []` on purpose — a fetch failure (DB down, missing env
  // vars) must not read as "the family owns no colonies" (/review finding: this is the
  // same no-data-vs-no-results confusion PlotSearch.tsx and ColonyMap.tsx already had to
  // fix once each).
  const [loadError, setLoadError] = useState(false);
  const [selectedColonyId, setSelectedColonyId] = useState<string | null>(null);

  useEffect(() => {
    if (!actor) return;
    loadVerifiedColonies(getBrowserDbClient())
      .then(setColonies)
      .catch((error: unknown) => {
        console.error("failed to load colony list:", error);
        setLoadError(true);
      });
  }, [actor]);

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

  if (loadError) {
    return (
      <div className="colony-picker-overlay">
        <p className="colony-picker-empty">Could not load colonies. Check your connection.</p>
      </div>
    );
  }

  if (!colonies) return null;

  if (!selectedColonyId) {
    return <ColonyPicker colonies={colonies} onSelect={setSelectedColonyId} />;
  }

  return <ColonyMap actor={actor} colonyId={selectedColonyId} />;
}

export default App;
