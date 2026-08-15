import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// SUPABASE_SERVICE_ROLE_KEY is deliberately not VITE_-prefixed (docs/plans/09.md) so it
// never reaches import.meta.env/the browser bundle — live-integration tests that need it
// (lib/auth/testHelpers.ts) read it from process.env instead, same technique
// scripts/import-seed.ts already uses.
declare const process: { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

// jsdom implements no SVG layout, so SVGGraphicsElement.getBBox() is missing entirely
// (throws "not a function") rather than returning zeroes the way a real browser would
// for an unlaid-out node. ColonyMap.tsx's selection/search/dimension-callout code
// (M6, spec/06) calls it whenever a plot is selected — stub it so click-driven DOM
// tests can run without a real layout engine; the actual numbers are irrelevant here,
// jsdom tests never assert on drawn geometry.
const stubBBox = (): DOMRect => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  toJSON: () => ({}),
});
// Both prototypes, unconditionally — jsdom's SVG class hierarchy doesn't reliably put
// getBBox where a real browser's does, so checking "does it already exist" isn't a
// safe guard here; overwriting is harmless since this file only ever runs in jsdom.
for (const ctor of [globalThis.SVGElement, globalThis.SVGGraphicsElement]) {
  if (!ctor) continue;
  Object.defineProperty(ctor.prototype, "getBBox", { value: stubBBox, configurable: true });
}
