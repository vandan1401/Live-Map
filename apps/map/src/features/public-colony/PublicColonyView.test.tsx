import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PublicColonyView } from "./PublicColonyView.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path class="plot" id="plot-A-01" d="M10,10 L40,10 L40,40 L10,40 Z"/>
</svg>`;

// A stub, not a live Supabase client (docs/plans/25.md task G — get_public_colony's own
// correctness is already covered live in publicColony.test.ts; this file's job is the
// component's reaction to a resolved result, kept fast and deterministic).
function stubClient(plots: unknown[]): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: { found: true, colony: { id: "test-colony", name: "Test Colony", svg: SVG }, plots },
      error: null,
    }),
  } as unknown as SupabaseClient;
}

// jsdom has no layout engine — getBoundingClientRect is zero by default, which
// renderColonyPreview.ts's own Math.max(1, ...) guard turns into a forced 1x1 viewport. A
// 100x100 square matching this file's own 100x100 viewBox gives fitView() scale=1 and no
// pan offset, so a click's screen pixels equal SVG-space units directly — no extra
// coordinate math needed in this test to know where a click lands.
const SQUARE_RECT = {
  width: 100,
  height: 100,
  left: 0,
  top: 0,
  right: 100,
  bottom: 100,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(SQUARE_RECT);
});

describe("PublicColonyView — plot dimensions on click", () => {
  it("shows nothing before any click, then a plot's dimensions when clicked on it", async () => {
    const client = stubClient([
      {
        svg_id: "plot-A-01",
        status: "available",
        block: "A",
        number: "01",
        area_sqft: 1200,
        length_ft: 30,
        breadth_ft: 40,
      },
    ]);
    render(<PublicColonyView client={client} token="tok" />);
    await waitFor(() => expect(screen.getByText("Test Colony")).toBeTruthy());

    expect(screen.queryByText("A-01")).toBeNull();

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.click(canvas, { clientX: 25, clientY: 25 }); // inside plot-A-01's ring

    expect(await screen.findByText("A-01")).toBeTruthy();
    expect(screen.getByText("30 ft")).toBeTruthy();
    expect(screen.getByText("40 ft")).toBeTruthy();
    expect(screen.getByText("1200 sq ft")).toBeTruthy();
    // Never anything from the authenticated plot-detail flow — no owner, no status action.
    expect(screen.queryByText(/Owner/)).toBeNull();
  });

  it("dismisses the panel when its close button is clicked", async () => {
    const client = stubClient([
      {
        svg_id: "plot-A-01",
        status: "available",
        block: "A",
        number: "01",
        area_sqft: 1200,
        length_ft: 30,
        breadth_ft: 40,
      },
    ]);
    render(<PublicColonyView client={client} token="tok" />);
    await waitFor(() => expect(screen.getByText("Test Colony")).toBeTruthy());

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.click(canvas, { clientX: 25, clientY: 25 });
    expect(await screen.findByText("A-01")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByText("A-01")).toBeNull();
  });

  it("clears the panel on a click that misses every plot", async () => {
    const client = stubClient([
      {
        svg_id: "plot-A-01",
        status: "available",
        block: "A",
        number: "01",
        area_sqft: 1200,
        length_ft: 30,
        breadth_ft: 40,
      },
    ]);
    render(<PublicColonyView client={client} token="tok" />);
    await waitFor(() => expect(screen.getByText("Test Colony")).toBeTruthy());

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.click(canvas, { clientX: 25, clientY: 25 });
    expect(await screen.findByText("A-01")).toBeTruthy();

    fireEvent.click(canvas, { clientX: 90, clientY: 90 }); // outside the plot's ring
    expect(screen.queryByText("A-01")).toBeNull();
  });
});
