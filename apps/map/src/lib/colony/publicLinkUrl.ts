// Pure, DOM-free (docs/plans/22.md phase 2). `App.tsx` checks the URL for a public link
// before any authenticated-path branch — a hash fragment, never a path segment, since a
// hash is never sent to the server: no wrangler.toml/Cloudflare routing change, no
// public/sw.js interaction, needed for this to work on a direct load of the deployed site.
const PUBLIC_HASH_PATTERN =
  /^#\/public\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parsePublicToken(hash: string): string | null {
  const match = PUBLIC_HASH_PATTERN.exec(hash);
  return match ? match[1] : null;
}

// The inverse of parsePublicToken — building the hash a signed-in family member copies to
// share a colony's already-generated public link (ColonyPicker's "Copy share link", owner
// ask 2026-09-01). Pure/DOM-free on purpose: the caller prepends window.location.origin +
// pathname, which this file must never touch (see the header comment above).
export function buildPublicLinkHash(token: string): string {
  return `#/public/${token}`;
}
