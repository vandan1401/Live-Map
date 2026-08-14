import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatShareSummary, loadShareSummaryData } from "../../lib/colony/shareSummary.ts";

interface Props {
  client: SupabaseClient | null;
  colonyId: string;
}

// Generated on demand, not kept live — the family pastes this into WhatsApp by hand
// (spec/06: "do not fight the existing habit"), so a snapshot at the moment they tap
// the button is exactly what they expect, not a running total.
export function ShareSummary({ client, colonyId }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    setText(null);
    setError(null);
    setCopied(false);
    if (!client) {
      setError("Not connected to the database.");
      return;
    }
    loadShareSummaryData(client, colonyId)
      .then((data) => setText(formatShareSummary(data)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not build the summary.");
      });
  };

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch((err: unknown) => {
        console.error("clipboard write failed:", err);
      });
  };

  return (
    <>
      <button type="button" className="colony-share-trigger" onClick={handleOpen}>
        Share update
      </button>
      {open && (
        <div className="colony-share-overlay">
          <div className="colony-share-panel">
            <button
              type="button"
              className="colony-share-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            {error && <p className="colony-share-error">{error}</p>}
            {!error && !text && <p className="colony-share-loading">Building summary…</p>}
            {text && (
              <>
                <pre className="colony-share-text">{text}</pre>
                <button type="button" className="colony-share-copy" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
