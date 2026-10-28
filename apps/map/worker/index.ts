import { loadOgColony, matchPublicPath, servePreviewImage, type Env } from "./publicShare.ts";

// Cloudflare only ever routes a request here when it does NOT match a real file under
// ./dist (see wrangler.toml's own comment) — every static asset (the SPA shell at "/",
// /assets/*.js, /manifest.webmanifest, ...) is served directly with this Worker never
// invoked, unchanged from the pure-static site this was before 2026-09-14. The one route
// this Worker adds is /public/<token>[/preview.png] — see publicShare.ts's
// matchPublicPath(). Anything else falls through to env.ASSETS.fetch() below, matching
// Cloudflare's own default-asset-serving behaviour for a genuinely unmatched path.
export interface WorkerEnv extends Env {
  ASSETS: Fetcher;
}

// PublicColonyView.tsx's own subtitle line — kept in sync by hand, same as its "Indicative
// layout — not to scale" caption; no shared string module exists yet to import this from
// without pulling React-facing code into a Worker's own tsconfig.worker.json.
const OG_DESCRIPTION = "See the live plot-status map — available, booked, and registered.";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const match = matchPublicPath(url.pathname);

    if (!match) return env.ASSETS.fetch(request);
    if (match.wantsImage) return servePreviewImage(env, match.token);
    return serveColonyShell(request, env, match.token);
  },
};

async function serveColonyShell(request: Request, env: WorkerEnv, token: string): Promise<Response> {
  // Cloudflare's documented way to re-target a Request's URL while keeping its other
  // fields (method/headers) — see MDN/workerd's `new Request(url, request)` clone form.
  const shellRequest = new Request(new URL("/index.html", request.url), request);
  const shell = await env.ASSETS.fetch(shellRequest);

  // A transport failure here must not break the page — it degrades to the generic
  // "Colony" title/no-image case below, same as PublicColonyView.tsx's own found:null
  // rendering for "still loading" vs. "really not found".
  const found = await loadOgColony(env, token).catch(() => null);

  const title = found ? found.colony.name : "Colony";
  const imageUrl = found ? new URL(`/public/${token}/preview.png`, request.url).toString() : null;

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on("head", {
      element(el) {
        appendOgTags(el, title, imageUrl);
      },
    })
    .transform(shell);
}

function appendOgTags(head: Element, title: string, imageUrl: string | null): void {
  const tag = (attrs: string) => head.append(`<meta ${attrs}>`, { html: true });
  tag(`property="og:title" content="${escapeHtml(title)}"`);
  tag(`property="og:description" content="${escapeHtml(OG_DESCRIPTION)}"`);
  tag(`property="og:type" content="website"`);
  tag(`name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}"`);
  if (imageUrl) {
    tag(`property="og:image" content="${escapeHtml(imageUrl)}"`);
    tag(`name="twitter:image" content="${escapeHtml(imageUrl)}"`);
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
