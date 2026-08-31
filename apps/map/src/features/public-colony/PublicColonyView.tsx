import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicColony } from "../../lib/colony/publicColony.ts";
import { renderColonyPreview } from "../../components/map/renderColonyPreview.ts";
import type { PublicColonyResult } from "../../lib/db/types.ts";

interface Props {
  client: SupabaseClient;
  token: string;
}

// docs/plans/22.md phase 2: the unauthenticated, per-colony, token-scoped read-only view.
// No search, no table view, no share summary, no plot-detail sheet, no click-to-select, no
// legend filter, no live realtime subscription (see the plan's Non-goals) — a single still
// render of plot status only, via the same renderColonyPreview() the upload-confirmation
// screen uses, fed the real statuses get_public_colony() returned.
export function PublicColonyView({ client, token }: Props) {
  const [result, setResult] = useState<PublicColonyResult | "loading" | "error">("loading");
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadPublicColony(client, token)
      .then((loaded) => {
        if (!cancelled) setResult(loaded);
      })
      .catch(() => {
        if (!cancelled) setResult("error");
      });
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  useEffect(() => {
    if (result === "loading" || result === "error" || !result.found || !previewRef.current) return;
    const container = previewRef.current;
    container.innerHTML = "";
    const statuses: Record<string, string> = {};
    for (const plot of result.plots) statuses[plot.svg_id] = plot.status;
    return renderColonyPreview(container, result.colony.svg, statuses);
  }, [result]);

  if (result === "loading") {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">Loading…</p>
      </div>
    );
  }

  // A transport/network failure is a different state from get_public_colony() actually
  // resolving the token — it reveals nothing about whether the token names a real colony,
  // so unlike the found:false branch below, it does not need to share that message (a
  // "your link is fine, we just couldn't reach the server" case, not a security ambiguity).
  if (result === "error") {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">Could not load this colony. Check your connection and try again.</p>
      </div>
    );
  }

  // Wrong token, revoked/regenerated token, and an unverified colony are all shown the same
  // way on purpose — see get_public_colony()'s own comment (docs/plans/22.md §3): a
  // distinguishable message would let a caller confirm a guessed uuid belongs to a real
  // colony without ever seeing its data.
  if (!result.found) {
    return (
      <div className="public-colony-overlay">
        <p className="public-colony-message">This link is invalid or has been revoked.</p>
      </div>
    );
  }

  return (
    <div className="public-colony-page">
      <header className="public-colony-header">
        <h1 className="public-colony-title">{result.colony.name}</h1>
        <p className="public-colony-hint">Indicative layout — not to scale.</p>
      </header>
      <div ref={previewRef} className="public-colony-preview" />
    </div>
  );
}
