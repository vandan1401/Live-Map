import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ColonyUploadScreen } from "./ColonyUploadScreen.tsx";

afterEach(() => {
  cleanup();
});

function createFakeSupabaseClient(): SupabaseClient {
  return {
    rpc: () => Promise.resolve({ data: { ok: true, colony_id: "test" }, error: null }),
  } as unknown as SupabaseClient;
}

const VALID_MANIFEST = {
  colony: {
    id: "test-colony",
    name: "Test Colony",
    viewbox: [0, 0, 1000, 500],
    scale: { px_per_ft: 2.5 },
    north_deg: 0,
    generated: "2026-08-17",
    verified: false,
    source: { file: "test.dxf", revision: "1", plan_date: "2026-08-17", method: "dxf" },
  },
  plots: [
    {
      svg_id: "plot-A-01",
      block: "A",
      number: "01",
      area_sqft: 1200,
      length_ft: 30,
      breadth_ft: 40,
      centroid: [10, 10],
      facing: "north",
      is_corner: false,
    },
  ],
  features: [],
};

const VALID_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><path id="plot-A-01"/></svg>`;

function jsonFile(content: unknown): File {
  return new File([JSON.stringify(content)], "colony.json", { type: "application/json" });
}

function svgFile(content: string): File {
  return new File([content], "colony.svg", { type: "image/svg+xml" });
}

async function chooseFilesAndContinue(json: unknown, svg: string) {
  fireEvent.change(screen.getByLabelText("Choose colony.json"), {
    target: { files: [jsonFile(json)] },
  });
  fireEvent.change(screen.getByLabelText("Choose colony.svg"), {
    target: { files: [svgFile(svg)] },
  });
  fireEvent.click(screen.getByText("Continue"));
}

describe("ColonyUploadScreen", () => {
  it("disables Upload until the confirmation checkbox is ticked", async () => {
    render(<ColonyUploadScreen client={createFakeSupabaseClient()} onClose={vi.fn()} />);

    await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG);

    const uploadButton = await waitFor(() => screen.getByText("Upload") as HTMLButtonElement);
    expect(uploadButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText("I compared this against the site plan"));
    expect(uploadButton).not.toBeDisabled();
  });

  it("rejects a manifest with verified: true before any RPC call", async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as SupabaseClient;
    render(<ColonyUploadScreen client={client} onClose={vi.fn()} />);

    await chooseFilesAndContinue(
      { ...VALID_MANIFEST, colony: { ...VALID_MANIFEST.colony, verified: true } },
      VALID_SVG,
    );

    await waitFor(() => expect(screen.getByText(/These files could not be used/)).toBeInTheDocument());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a manifest whose svg_id set disagrees with the SVG", async () => {
    render(<ColonyUploadScreen client={createFakeSupabaseClient()} onClose={vi.fn()} />);

    await chooseFilesAndContinue(VALID_MANIFEST, `<svg xmlns="http://www.w3.org/2000/svg"></svg>`);

    await waitFor(() => expect(screen.getByText(/These files could not be used/)).toBeInTheDocument());
    expect(screen.getByText(/in manifest but not svg: plot-A-01/)).toBeInTheDocument();
  });
});
