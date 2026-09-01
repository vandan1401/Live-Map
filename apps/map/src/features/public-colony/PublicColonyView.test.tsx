import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PublicColonyView } from "./PublicColonyView.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path class="plot" id="plot-A-01" d="M10,10 L40,10 L40,40 L10,40 Z"/>
</svg>`;

// The real client.rpc(...) returns a PostgrestBuilder — thenable (awaitable) AND chainable
// (colonies.ts's fetchPublicColony calls .abortSignal(...) on it before awaiting, added
// 2026-09-01 to fix a stalled mobile connection hanging forever). A stub must support both,
// not just be a plain Promise — .abortSignal is not a function on a bare Promise.
function rpcBuilder(settle: Promise<{ data: unknown; error: unknown }>) {
  return { abortSignal: () => settle, then: settle.then.bind(settle) };
}

// A stub, not a live Supabase client (docs/plans/25.md task G — get_public_colony's own
// correctness is already covered live in publicColony.test.ts; this file's job is the
// component's reaction to a resolved result, kept fast and deterministic).
function stubClient(plots: unknown[]): SupabaseClient {
  return {
    rpc: vi.fn(() =>
      rpcBuilder(
        Promise.resolve({
          data: {
            found: true,
            colony: {
              id: "test-colony",
              name: "Test Colony",
              svg: SVG,
              select_zoom_ref_width_px: null,
              select_zoom_ref_height_px: null,
            },
            plots,
          },
          error: null,
        }),
      ),
    ),
  } as unknown as SupabaseClient;
}

function stubErrorClient(): SupabaseClient {
  return {
    rpc: vi.fn(() => rpcBuilder(Promise.resolve({ data: null, error: { message: "network down" } }))),
  } as unknown as SupabaseClient;
}

function stubNotFoundClient(): SupabaseClient {
  return {
    rpc: vi.fn(() => rpcBuilder(Promise.resolve({ data: { found: false }, error: null }))),
  } as unknown as SupabaseClient;
}

// Owner ask, 2026-09-01 ("exactly copy colony owners ui" — real pan/zoom, fly-to-plot on
// selection, dimension lines drawn on the canvas itself) moved this view onto
// usePublicColonyCanvas.ts's Leaflet+canvas renderer. ColonyMap.test.tsx — the
// authenticated map's own test file, and the only other place in this repo that mounts this
// Leaflet+canvas pipeline — never simulates a real click through it either; jsdom has no
// canvas backend and no real layout for getBoundingClientRect, so Leaflet's own pixel-to-
// latlng math cannot be trusted under it (the same reason docs/plans/25.md task G already
// flagged the live click UX as "not achievable from Claude, needs a human pass on a real
// device"). This file follows that same established split: smoke-test the chrome renders
// and mounts without a canvas backend, and leave the pure picking math (resolveClickedPlot,
// pickPlotAt) to colonyModel.test.ts's own direct unit tests, which this view's click
// handler calls unchanged.
describe("PublicColonyView", () => {
  it("shows a loading message before the RPC resolves", () => {
    const client = {
      rpc: vi.fn(() => rpcBuilder(new Promise(() => {}))),
    } as unknown as SupabaseClient;
    render(<PublicColonyView client={client} token="tok" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows a connection-error message when the RPC call itself fails", async () => {
    render(<PublicColonyView client={stubErrorClient()} token="tok" />);
    expect(
      await screen.findByText("Could not load this colony. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it("shows an invalid-link message for an unresolved token, indistinguishable from any other not-found reason", async () => {
    render(<PublicColonyView client={stubNotFoundClient()} token="tok" />);
    expect(await screen.findByText("This link is invalid or has been revoked.")).toBeInTheDocument();
  });

  // Owner ask, 2026-09-01: a stalled mobile connection used to leave a visitor stuck on
  // "Loading…" forever with no way back except a full page reload (fetch() has no built-in
  // timeout — colonies.ts's fetchPublicColony now imposes one via abortSignal). This proves
  // the recovery path this app can actually offer once that timeout fires and turns into
  // this same error state: an in-app retry, not a reload.
  it("recovers from an error via the Try again button, without a page reload", async () => {
    const rpc = vi
      .fn()
      .mockImplementationOnce(() => rpcBuilder(Promise.resolve({ data: null, error: { message: "network down" } })))
      .mockImplementationOnce(() =>
        rpcBuilder(
          Promise.resolve({
            data: {
              found: true,
              colony: { id: "c", name: "Test Colony", svg: SVG, select_zoom_ref_width_px: null, select_zoom_ref_height_px: null },
              plots: [],
            },
            error: null,
          }),
        ),
      );
    const client = { rpc } as unknown as SupabaseClient;
    render(<PublicColonyView client={client} token="tok" />);

    const retryButton = await screen.findByText("Try again");
    fireEvent.click(retryButton);

    expect(await screen.findByText("Test Colony")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("mounts the map chrome without a canvas backend, with no plot panel before any selection", async () => {
    // jsdom implements no canvas, so getContext returns null and the layer skips drawing —
    // the same tolerance ColonyMap.test.tsx already establishes for useColonyCanvas.ts, now
    // exercised for its public counterpart.
    const client = stubClient([
      { svg_id: "plot-A-01", status: "available", block: "A", number: "01", area_sqft: 1200, length_ft: 30, breadth_ft: 40 },
    ]);
    render(<PublicColonyView client={client} token="tok" />);

    expect(await screen.findByText("Test Colony")).toBeInTheDocument();
    expect(screen.getByText("Indicative layout — not to scale")).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument(); // compass
    expect(screen.queryByText("A-01")).toBeNull();
    expect(screen.queryByText(/Owner/)).toBeNull();
  });
});
