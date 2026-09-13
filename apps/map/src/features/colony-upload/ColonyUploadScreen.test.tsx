import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ColonyUploadScreen } from "./ColonyUploadScreen.tsx";

afterEach(() => {
  cleanup();
});

// docs/plans/32.md (task E, a named /review finding against the previous attempt): a
// blind "resolve anything" proxy cannot prove a manifest-driven backdrop write sends the
// right payload, so this fake records .update()'s exact argument via `updateSpy`.
// docs/plans/33.md: also fakes `.storage.from(...).upload(...)`, recorded via
// `storageUploadSpy`, for the inline backdrop-image upload path.
function createFakeSupabaseClient(
  updateSpy?: (payload: Record<string, unknown>) => void,
  storageUploadSpy?: (path: string) => void,
): SupabaseClient {
  function makeChain() {
    const chain = {
      update: (payload: Record<string, unknown>) => {
        updateSpy?.(payload);
        return chain;
      },
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: { id: "test-colony" }, error: null }),
    };
    return chain;
  }
  return {
    rpc: () => Promise.resolve({ data: { ok: true, colony_id: "test-colony" }, error: null }),
    from: () => makeChain(),
    storage: {
      from: () => ({
        upload: (path: string) => {
          storageUploadSpy?.(path);
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  } as unknown as SupabaseClient;
}

// A tiny, real, valid 1x1 JPEG — same fixture as colonyBackdrop.test.ts's TINY_JPEG_BASE64,
// duplicated here rather than shared since this file's imports are all fakes/DOM helpers.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

function backdropJpegFile(): File {
  const bytes = Uint8Array.from(atob(TINY_JPEG_BASE64), (c) => c.charCodeAt(0));
  return new File([bytes], "backdrop.jpg", { type: "image/jpeg" });
}

function notAJpegFile(): File {
  return new File(["not a jpeg"], "backdrop.jpg", { type: "image/jpeg" });
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

async function chooseFilesAndContinue(json: unknown, svg: string, backdrop?: File) {
  fireEvent.change(screen.getByLabelText("Choose colony.json"), {
    target: { files: [jsonFile(json)] },
  });
  fireEvent.change(screen.getByLabelText("Choose colony.svg"), {
    target: { files: [svgFile(svg)] },
  });
  if (backdrop) {
    fireEvent.change(screen.getByLabelText("Choose backdrop image"), {
      target: { files: [backdrop] },
    });
  }
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

  // docs/plans/33.md: a successful upload lands on the terminal "done" summary in this
  // same panel — it does not auto-close, so the message (and any backdrop outcome) stays
  // visible until the user clicks the panel's own close button.
  it("shows the done summary after a successful upload, without closing the flow", async () => {
    const onClose = vi.fn();
    render(<ColonyUploadScreen client={createFakeSupabaseClient()} onClose={onClose} />);

    await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG);
    fireEvent.click(await waitFor(() => screen.getByLabelText("I compared this against the site plan")));
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(screen.getByText(/Colony "test-colony" is live/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  // docs/plans/33.md — the owner's actual ask: the backdrop image sits on the same
  // picking screen as colony.json/colony.svg and uploads in the same action, no separate
  // screen or extra step. jsdom never actually decodes image bytes (no real onload), so
  // Image/URL are stubbed here — see colonyBackdrop.test.ts's readBackdropImageFile tests
  // for the same reasoning.
  it("uploads a backdrop image chosen on the picking screen as part of the same upload", async () => {
    class FakeImage {
      naturalWidth = 10;
      naturalHeight = 10;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });

    try {
      const storageUploadSpy = vi.fn();
      render(<ColonyUploadScreen client={createFakeSupabaseClient(undefined, storageUploadSpy)} onClose={vi.fn()} />);

      await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG, backdropJpegFile());
      fireEvent.click(await waitFor(() => screen.getByLabelText("I compared this against the site plan")));
      fireEvent.click(screen.getByText("Upload"));

      await waitFor(() => expect(screen.getByText(/backdrop image was uploaded/)).toBeInTheDocument());
      expect(storageUploadSpy).toHaveBeenCalledWith("test-colony.jpg");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never gates Continue or Upload on the backdrop file's absence", async () => {
    render(<ColonyUploadScreen client={createFakeSupabaseClient()} onClose={vi.fn()} />);

    // chooseFilesAndContinue with no backdrop arg already exercises "Continue" with no
    // backdrop file chosen — reaching "ready" proves it wasn't blocked.
    await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG);
    const uploadButton = await waitFor(() => screen.getByText("Upload") as HTMLButtonElement);
    fireEvent.click(screen.getByLabelText("I compared this against the site plan"));
    expect(uploadButton).not.toBeDisabled();
  });

  // A failed image upload (unrecognized magic number here) must not fail the whole upload
  // or the already-created colony — same non-blocking precedent as a bad manifest-driven
  // alignment.
  it("still completes the upload when the chosen backdrop file is not a recognized image format", async () => {
    render(<ColonyUploadScreen client={createFakeSupabaseClient()} onClose={vi.fn()} />);

    await chooseFilesAndContinue(VALID_MANIFEST, VALID_SVG, notAJpegFile());
    fireEvent.click(await waitFor(() => screen.getByLabelText("I compared this against the site plan")));
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(screen.getByText(/Colony "test-colony" is live/)).toBeInTheDocument());
    expect(
      screen.getByText(
        /Could not upload the backdrop image \(That file is not a recognized image format \(JPEG, PNG, WebP, or GIF\)\.\)/,
      ),
    ).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText(/Colony "test-colony" is live/)).toBeInTheDocument());
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
