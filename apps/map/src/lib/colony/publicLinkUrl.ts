// Pure, DOM-free (docs/plans/22.md phase 2). `App.tsx` checks the URL for a public link
// before any authenticated-path branch.
//
// Two URL forms exist on purpose. The hash form (`#/public/<token>`) was the original and
// only form — a hash is never sent to the server, so it needed no wrangler.toml/Cloudflare
// routing change and no public/sw.js interaction to work on a direct load of the deployed
// site. 2026-09-14: that same property turned out to be exactly the problem for WhatsApp
// link previews — an unfurler fetches the URL server-side and never runs this page's JS, so
// it can never see a hash fragment at all, only a real path. New share links now use the
// path form (`/public/<token>`, worker/index.ts on the deploy side) so a preview can be
// built server-side; the hash form is kept parseable forever so links already sent out
// before this change keep opening (see parsePublicToken's own doc comment for what it
// loses by staying on the old form).
const PUBLIC_HASH_PATTERN =
  /^#\/public\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PUBLIC_PATH_PATTERN =
  /^\/public\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// Checks the path first, then the hash — an old hash link opened today still carries a
// pathname of "/", so there's no ambiguity between the two forms to resolve. A hash-form
// link never gets a rich WhatsApp preview (worker/index.ts never sees it), only the
// generic default in index.html; it still opens exactly as before.
export function parsePublicToken(pathname: string, hash: string): string | null {
  const pathMatch = PUBLIC_PATH_PATTERN.exec(pathname);
  if (pathMatch) return pathMatch[1];
  const hashMatch = PUBLIC_HASH_PATTERN.exec(hash);
  return hashMatch ? hashMatch[1] : null;
}

// The inverse of parsePublicToken's path branch — building the link a signed-in family
// member copies to share a colony (ColonyPicker's "Copy share link", owner ask 2026-09-01;
// switched from the hash form to this one 2026-09-14 for the WhatsApp preview to work).
// Pure/DOM-free on purpose: the caller prepends window.location.origin, which this file
// must never touch (see the header comment above).
export function buildPublicLinkPath(token: string): string {
  return `/public/${token}`;
}
