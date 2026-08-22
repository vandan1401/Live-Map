/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ColonyMap } from "./ColonyMap";

// The fixture's SVG is no longer compiled into the app (docs/plans/11.md — it arrives via
// the colonySvg prop, sourced from colonies.svg at runtime). This test file reads it with
// plain fs, not a `?raw` import (/review finding: a `?raw` import here is exactly the
// build-time-fixture-path pattern acceptance criterion 1 grep-checks apps/map/src for —
// same reasoning scripts/import-seed.ts already follows for the same file).
const fixtureSvg = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/shree-vatika-2/colony.svg"),
  "utf-8",
);

afterEach(() => {
  cleanup();
});

// A generic "any chained call resolves to no data" stub — these tests assert on the
// static SVG/DOM, not on live sync data, so a real client (and Docker) isn't needed.
// docs/plans/09.md: client is now a required prop (created once in App.tsx), not created
// internally, so every render call site needs one.
function createFakeSupabaseClient(): SupabaseClient {
  const chain: unknown = new Proxy(function chain() {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return chain;
    },
    apply() {
      return chain;
    },
  });
  return {
    from: () => chain,
    channel: () => chain,
    removeChannel: () => {},
    auth: { signOut: () => Promise.resolve({ error: null }) },
  } as unknown as SupabaseClient;
}

describe("ColonyMap", () => {
  it("mounts without a canvas backend and still renders its chrome", () => {
    // jsdom implements no canvas, so getContext returns null and the layer skips drawing.
    // That path has to be safe: if it throws, the whole map screen is a white page on any
    // browser that refuses a context (private modes, blocked fingerprinting).
    const { getByText } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        colonySvg={fixtureSvg}
        onBack={vi.fn()}
      />,
    );
    expect(getByText("Indicative layout — not to scale")).toBeInTheDocument();
  });

  it("shows the not-to-scale note", () => {
    const { getByText } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        colonySvg={fixtureSvg}
        onBack={vi.fn()}
      />,
    );
    expect(getByText("Indicative layout — not to scale")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        colonySvg={fixtureSvg}
        onBack={onBack}
      />,
    );
    getByText("← Colonies").click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
