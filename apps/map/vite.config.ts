import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// apps/map and tools/pipeline share fixtures/ at the repo root (see NAVIGATION.md) —
// the app reads the fixture in place rather than duplicating it, so dev/build need
// filesystem access outside this package.
const repoRoot = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
