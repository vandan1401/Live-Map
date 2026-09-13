import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ColonyUploadScreen } from "./ColonyUploadScreen.tsx";

afterEach(() => {
  cleanup();
});

// docs/plans/31.md: a successful upload now also fetches the fresh colony row (for the
// chained backdrop step) via client.from("colonies")...maybeSingle(). docs/plans/32.md
// (task E, a named /review finding against the previous attempt): a blind "resolve
// anything" proxy cannot prove a manifest-driven backdrop write sends the right payload,
// so this fake distinguishes .select() (fetchColonyById's read) from .update()
// (applyManifestBackdrop's write) and lets a test record the .update() call's argument.
const FAKE_COLONY_ROW = {
  id: "test-colony",
  org_id: "org-test-1",
  name: "Test Colony",
  verified: true,
  source_file: null,
  generated: null,
  svg: "<svg></svg>",
  created_at: new Date("2020-01-01").toISOString(),
  public_token: null,
  select_zoom_ref_width_px: null,
  select_zoom_ref_height_px: null,
  backdrop_storage_path: null,
  backdrop_image_width: null,
  backdrop_image_height: null,
  backdrop_transform_x: 0,
  backdrop_transform_y: 0,
  backdrop_transform_scale: 1,
  backdrop_transform_rotate_deg: 0,
  backdrop_darken_alpha: 0,
  backdrop_enabled_on_admin: false,
  backdrop_enabled_on_public: false,
  backdrop_attribution: "",
};

// A fresh chain per .from("colonies") call, matching real supabase-js — fetchColonyById's
// .select("*").eq(...).maybeSingle() and applyManifestBackdrop's own
// .update({...}).eq(...).select("id").maybeSingle() must not share mutable state.
// `updateSpy`, when given, is invoked with .update()'s exact payload.
function createFakeSupabaseClient(updateSpy?: (payload: Record<string, unknown>) => void): SupabaseClient {
  function makeChain() {
    let updated = false;
    const chain = {
      update: (payload: Record<string, unknown>) => {
        updated = true;
        updateSpy?.(payload);
        return chain;
      },
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve(
          updated ? { data: { id: "test-colony" }, error: null } : { data: FAKE_COLONY_ROW, error: null },
        ),
    };
    return chain;
  }
  return {
    rpc: () => Promise.resolve({ data: { ok: true, colony_id: "test-colony" }, error: null }),
    from: () => makeChain(),
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

const BACKDROP = {
  transform: { x: 864, y: 283, scale: 0.105, rotate_deg: 0 },
  darken_alpha: 0.65,
  enabled_on_admin: true,
  enabled_on_public: true,
  attribution: "OpenStreetMap contributors (ODbL)",
};

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

  // docs/plans/31.md: the whole point of this plan — a successful upload chains straight
  // into the backdrop step (ColonyBackdropScreen), it does not just show a "done" message
  // and stop.
  it("chains into the backdrop step after a successful upload, without closing the flow", async () => {
    const onClose = vi.fn();
    render(<ColonyUploadScreen client={createFakeSupabaseClient()} onClose={onClose} />);

    await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG);
    fireEvent.click(await waitFor(() => screen.getByLabelText("I compared this against the site plan")));
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(screen.getByText(/Backdrop — Test Colony/)).toBeInTheDocument());
    expect(screen.getByText(/Colony "test-colony" is live/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // docs/plans/32.md task E, the exact /review gap named against the previous attempt: a
  // manifest declaring `backdrop` must actually write the mapped columns, not just show a
  // status string that a blind mock could satisfy either way.
  it("applies colony.json's backdrop block to the newly created colony", async () => {
    const updateSpy = vi.fn();
    render(<ColonyUploadScreen client={createFakeSupabaseClient(updateSpy)} onClose={vi.fn()} />);

    await chooseFilesAndContinue(
      { ...VALID_MANIFEST, colony: { ...VALID_MANIFEST.colony, backdrop: BACKDROP } },
      VALID_SVG,
    );
    fireEvent.click(await waitFor(() => screen.getByLabelText("I compared this against the site plan")));
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(screen.getByText(/backdrop alignment from colony\.json has been applied/)).toBeInTheDocument());
    expect(updateSpy).toHaveBeenCalledWith({
      backdrop_transform_x: 864,
      backdrop_transform_y: 283,
      backdrop_transform_scale: 0.105,
      backdrop_transform_rotate_deg: 0,
      backdrop_darken_alpha: 0.65,
      backdrop_enabled_on_admin: true,
      backdrop_enabled_on_public: true,
      backdrop_attribution: "OpenStreetMap contributors (ODbL)",
    });
  });

  // The other half of the same finding: omitting `backdrop` must mean "untouched", not
  // "reset to defaults" — provable only by asserting the write never happens at all.
  it("never calls update() for backdrop columns when the manifest declares no backdrop", async () => {
    const updateSpy = vi.fn();
    render(<ColonyUploadScreen client={createFakeSupabaseClient(updateSpy)} onClose={vi.fn()} />);

    await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG);
    fireEvent.click(await waitFor(() => screen.getByLabelText("I compared this against the site plan")));
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(screen.getByText(/Backdrop — Test Colony/)).toBeInTheDocument());
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
