import { createDbClient } from "../src/lib/db/client.ts";
import { fetchPublicColony } from "../src/lib/db/colonies.ts";
import type { PublicColonyResult } from "../src/lib/db/types.ts";
import { parsePublicToken } from "../src/lib/colony/publicLinkUrl.ts";
import { applyStatusVisibility } from "../src/shared/plotStatusVisibility.ts";
import { renderOgPng } from "./ogImage.ts";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const PREVIEW_IMAGE_SUFFIX = "/preview.png";

export interface PublicPathMatch {
  token: string;
  wantsImage: boolean;
}

// Reuses publicLinkUrl.ts's own path pattern (via parsePublicToken) rather than a second,
// hand-rolled regex here, so the two halves of the route — the client building the link,
// this Worker matching it — can't drift apart. Only strips the one extra suffix
// parsePublicToken doesn't know about: the preview-image sub-route this Worker adds.
export function matchPublicPath(pathname: string): PublicPathMatch | null {
  const wantsImage = pathname.endsWith(PREVIEW_IMAGE_SUFFIX);
  const bare = wantsImage ? pathname.slice(0, -PREVIEW_IMAGE_SUFFIX.length) : pathname;
  const token = parsePublicToken(bare, "");
  return token ? { token, wantsImage } : null;
}

function buildClient(env: Env) {
  // persistSession/autoRefreshToken off — no localStorage in a Worker, and this client
  // only ever calls the one anonymous, token-scoped RPC below (same posture live-
  // integration tests use for a guaranteed-stateless anon client).
  return createDbClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type FoundColony = Extract<PublicColonyResult, { found: true }>;

// A wrong/revoked/unverified token all come back `found: false` from get_public_colony()
// by design (docs/plans/22.md) — never distinguished, here either, so an OG preview can't
// become a side channel for probing whether a guessed token is real.
export async function loadOgColony(env: Env, token: string): Promise<FoundColony | null> {
  const result = await fetchPublicColony(buildClient(env), token);
  return result.found ? result : null;
}

// The live page never shows real status on first load either, for every colony — a toggle-
// enabled one only reveals it once a visitor taps it themselves, and a toggle-disabled one
// never at all (publicLinkConfig.ts's own doc comment, PublicColonyView.tsx). This image is
// unattended and can never be tapped, so it always renders the same all-"available" state
// that page opens on — applyStatusVisibility(..., false), unconditionally, regardless of
// this colony's own statusToggle setting. Showing real status here would leak it to anyone
// who merely sees the WhatsApp thumbnail, without them ever opening the link — strictly
// worse than what the toggle is already there to prevent.
const IMAGE_CACHE_TTL_SECONDS = 3600; // content now depends only on colony geometry (never
// real plot status), so an hour is about absorbing repeat crawler/link-share fetches, not
// freshness — a corrected re-import (D-118) still reaches viewers within the hour.

export async function servePreviewImage(env: Env, token: string): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(`https://og-cache.internal/public/${token}/preview.png`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const found = await loadOgColony(env, token);
  if (!found) return new Response("Not found", { status: 404 });

  const rawStatuses: Record<string, string> = {};
  for (const plot of found.plots) rawStatuses[plot.svg_id] = plot.status;
  const hiddenStatuses = applyStatusVisibility(rawStatuses, false);
  const plots = found.plots.map((plot) => ({ svg_id: plot.svg_id, status: hiddenStatuses[plot.svg_id] }));

  const png = await renderOgPng(found.colony.svg, plots);
  const response = new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": `public, max-age=${IMAGE_CACHE_TTL_SECONDS}`,
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}
