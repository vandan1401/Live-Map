import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSearchIndex, searchPlots, type SearchEntry } from "../../lib/colony/searchPlots.ts";

interface Props {
  client: SupabaseClient | null;
  colonyId: string;
  // ColonyMap.tsx owns the Leaflet instance and the SVG DOM — panning and opening the
  // detail sheet both have to happen there, same reason PlotDetailSheet reports status
  // changes back up via a callback rather than touching the DOM itself.
  onSelect: (svgId: string) => void;
}

// Owns its own data load, same pattern as PlotDetailSheet.tsx (client + colonyId props,
// fetch on mount). The whole colony fits in memory (spec/06), so the index is loaded
// once and every keystroke after that is a pure in-memory filter — no server round trip.
export function PlotSearch({ client, colonyId, onSelect }: Props) {
  const [index, setIndex] = useState<SearchEntry[]>([]);
  // Distinct from `index` being empty (a colony can genuinely have zero matches for a
  // query) — this is "we never got data at all", so it renders a different message
  // than "No matches" instead of looking like a real empty result (/review finding).
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    loadSearchIndex(client, colonyId)
      .then((entries) => {
        if (cancelled) return;
        setIndex(entries);
        setIndexLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("failed to load search index:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [client, colonyId]);

  const results = useMemo(() => searchPlots(index, query), [index, query]);

  const handleSelect = (entry: SearchEntry) => {
    onSelect(entry.svgId);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="colony-search">
      <input
        type="search"
        className="colony-search-input"
        placeholder="Search plot, owner, or broker"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim() && (
        <ul className="colony-search-results">
          {!client || !indexLoaded ? (
            <li className="colony-search-empty">Search unavailable</li>
          ) : results.length === 0 ? (
            <li className="colony-search-empty">No matches</li>
          ) : (
            results.map((entry) => (
              <li key={entry.svgId}>
                <button type="button" onClick={() => handleSelect(entry)}>
                  <span className="colony-search-result-label">{entry.label}</span>
                  {entry.ownerName && (
                    <span className="colony-search-result-detail">{entry.ownerName}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
