import { useState } from "react";
import { ColonyMap } from "./components/ColonyMap";
import { NamePrompt } from "./features/identity/NamePrompt";
import { getStoredActor, setStoredActor } from "./lib/identity/actor";

function App() {
  const [actor, setActor] = useState(() => getStoredActor());

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

  return <ColonyMap actor={actor} />;
}

export default App;
