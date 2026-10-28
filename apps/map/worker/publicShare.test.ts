import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/db/colonies.ts", () => ({ fetchPublicColony: vi.fn() }));
vi.mock("./ogImage.ts", () => ({ renderOgPng: vi.fn() }));

import { fetchPublicColony } from "../src/lib/db/colonies.ts";
import type { PublicColonyResult } from "../src/lib/db/types.ts";
import { renderOgPng } from "./ogImage.ts";
import { matchPublicPath, servePreviewImage } from "./publicShare.ts";

const TOKEN = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key" };

function stubCache() {
  // No Cloudflare Cache API in this jsdom-based test environment (apps/map/vite.config.ts)
  // — stubbed as an always-miss so every test exercises a real render, not a cached hit
  // from a previous test.
  const match = vi.fn().mockResolvedValue(undefined);
  const put = vi.fn().mockResolvedValue(undefined);
  (globalThis as unknown as { caches: unknown }).caches = { default: { match, put } };
  return { match, put };
}

beforeEach(() => {
  vi.mocked(fetchPublicColony).mockReset();
  vi.mocked(renderOgPng).mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  stubCache();
});

describe("matchPublicPath", () => {
  it("matches the plain colony path", () => {
    expect(matchPublicPath(`/public/${TOKEN}`)).toEqual({ token: TOKEN, wantsImage: false });
  });

  it("matches the preview-image sub-route", () => {
    expect(matchPublicPath(`/public/${TOKEN}/preview.png`)).toEqual({ token: TOKEN, wantsImage: true });
  });

  it("returns null for an unrelated path", () => {
    expect(matchPublicPath("/assets/index.js")).toBeNull();
  });
});

describe("servePreviewImage", () => {
  // publicLinkConfig.ts/PublicColonyView.tsx: real status is never shown on a public
  // colony's first paint, for ANY colony — a statusToggle-enabled one only reveals it once
  // a visitor taps to, a disabled one never at all. This image is unattended (nobody can
  // tap it), so it must always match that same hidden default regardless of what
  // get_public_colony() actually returned — a regression here would leak booked/registered
  // status to anyone who merely sees the WhatsApp thumbnail, without opening the link.
  it("forces every plot to 'available' before rendering, even when the RPC returned real status", async () => {
    vi.mocked(fetchPublicColony).mockResolvedValue({
      found: true,
      colony: {
        id: "c1",
        name: "Test Colony",
        svg: "<svg viewBox=\"0 0 10 10\"></svg>",
        select_zoom_ref_width_px: null,
        select_zoom_ref_height_px: null,
      },
      plots: [
        { svg_id: "plot-A-01", status: "booked", block: "A", number: 1, area_sqft: 100, length_ft: 10, breadth_ft: 10 },
        { svg_id: "plot-A-02", status: "registered", block: "A", number: 2, area_sqft: 100, length_ft: 10, breadth_ft: 10 },
      ],
      // Partial fixture, cast through unknown — mirrors PublicColonyView.test.tsx's own
      // style: only the fields this test's own code path actually reads (servePreviewImage
      // never touches any backdrop_* field).
    } as unknown as PublicColonyResult);

    await servePreviewImage(ENV, TOKEN);

    expect(renderOgPng).toHaveBeenCalledTimes(1);
    const plotsArg = vi.mocked(renderOgPng).mock.calls[0]?.[1] as { svg_id: string; status: string }[];
    expect(plotsArg.map((p) => p.status)).toEqual(["available", "available"]);
  });

  it("returns 404 without rendering when the token doesn't resolve", async () => {
    vi.mocked(fetchPublicColony).mockResolvedValue({ found: false });

    const response = await servePreviewImage(ENV, TOKEN);

    expect(response.status).toBe(404);
    expect(renderOgPng).not.toHaveBeenCalled();
  });
});
