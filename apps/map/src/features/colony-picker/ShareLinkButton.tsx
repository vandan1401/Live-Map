import { useState } from "react";
import { buildPublicLinkHash } from "../../lib/colony/publicLinkUrl.ts";

interface Props {
  // ColonyRow.public_token — already fetched with every colony row, no new query
  // (docs/plans/22.md phase 2). Generating/revoking the link itself stays an admin-only
  // action (the local admin-portal tool or scripts/generate-public-link.ts) — this button
  // only ever reads and shares what already exists (owner ask, 2026-09-01).
  token: string | null;
}

const COPIED_LABEL_MS = 2000; // long enough to read, short enough not to feel stuck

export function ShareLinkButton({ token }: Props) {
  const [copied, setCopied] = useState(false);

  if (!token) {
    return <span className="colony-picker-share colony-picker-share-empty">No public link yet</span>;
  }

  async function handleCopy() {
    const url = `${window.location.origin}${window.location.pathname}${buildPublicLinkHash(token as string)}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_LABEL_MS);
  }

  return (
    <button type="button" className="colony-picker-share" onClick={() => void handleCopy()}>
      {copied ? "Copied!" : "Copy share link"}
    </button>
  );
}
