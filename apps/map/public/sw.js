// M7 PWA service worker (spec/07). Hand-written, no Workbox/vite-plugin-pwa — see
// docs/plans/07.md §1/§3. sw.js's own bytes don't change on an app-code deploy, so the
// browser never detects an update and install/activate never re-run for one — CACHE_NAME
// only needs bumping when this file's own caching *behaviour* changes. A normal deploy's
// cache refresh (new hashed assets, old ones pruned) happens on every navigation instead
// — see refreshShellCache, called from both install and the navigate fetch handler.
const CACHE_NAME = "colony-map-v1";

const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

function extractAssetUrls(html) {
  return [...new Set(html.match(/\/assets\/[A-Za-z0-9._-]+/g) ?? [])];
}

// Brings the cache's /assets/* entries in line with what `html` (the current shell)
// actually references: adds anything missing, deletes anything no longer referenced.
// Called at install (first-ever visit — the browser already fetched the initial shell's
// own assets itself before the SW existed to intercept them, so they must be fetched
// again here) and on every successful navigation thereafter (a normal deploy changes
// index.html's hashed filenames but never sw.js's own bytes, so this is the only place a
// deploy's new assets get cached and its old ones get pruned — /review findings #2/#3).
async function refreshShellCache(cache, html) {
  const assetUrls = extractAssetUrls(html);
  const keys = await cache.keys();
  const stale = keys.filter((request) => {
    const pathname = new URL(request.url).pathname;
    return pathname.startsWith("/assets/") && !assetUrls.includes(pathname);
  });
  await Promise.all(stale.map((request) => cache.delete(request)));

  const missing = [];
  for (const url of assetUrls) {
    if (!(await cache.match(url))) missing.push(url);
  }
  if (missing.length > 0) await cache.addAll(missing);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        const shellResponse = await fetch("/index.html");
        await refreshShellCache(cache, await shellResponse.text());
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const html = await response.clone().text();
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/index.html", response.clone());
            await refreshShellCache(cache, html);
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  const isSameOriginAsset = url.origin === self.location.origin && request.method === "GET" && url.pathname.startsWith("/assets/");
  if (isSameOriginAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Only a successful response is cache-worthy (/review finding #5) — caching a
          // transient 404/5xx here would serve that error forever, since cache-first
          // never revalidates a hit.
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Cross-origin (Supabase API, etc.) and non-GET requests pass through untouched —
  // offline reads come from IndexedDB (src/pwa/offlineCache.ts), never a cached API
  // response (docs/plans/07.md §3: caching Supabase responses here would bypass the
  // freshness label).
});
