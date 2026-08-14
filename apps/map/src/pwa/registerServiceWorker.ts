// Registers public/sw.js (spec/07). Called once from main.tsx. Not unit-tested —
// service worker registration isn't reachable from jsdom (docs/plans/07.md §2.10).
export function registerServiceWorker(): void {
  // Production builds only (/review finding #3) — `pnpm dev`'s index.html points at
  // /src/main.tsx, not a hashed build; a worker registered there would precache the dev
  // shell and keep serving it after the dev server stops, and would still be attached to
  // this origin during any later `pnpm preview`-based upgrade check. `pnpm preview` runs
  // a real production build, so criterion 8's two-build DevTools check is unaffected.
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("service worker registration failed:", error);
    });
  });
}
