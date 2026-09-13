import { describe, expect, it, vi } from "vitest";
import { readBackdropImageFile } from "./backdropImageFile.ts";

// A tiny, real, valid 1x1 JPEG (the smallest fixture that still starts with the real FF D8
// FF magic bytes a real camera/export tool would produce) — same fixture as
// colonyBackdrop.test.ts's TINY_JPEG_BASE64.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

describe("readBackdropImageFile", () => {
  // jsdom's Image never actually decodes bytes (no real onload/naturalWidth), so this
  // stubs the browser primitives readImageDimensions calls — proves readBackdropImageFile
  // wires JPEG-check -> dimension-read -> byte-read together correctly, not that a real
  // browser decodes this fixture (unverifiable from here — no browser, see PROGRESS.md).
  it("resolves bytes and dimensions for a real JPEG", async () => {
    const bytes = Uint8Array.from(atob(TINY_JPEG_BASE64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "backdrop.jpg", { type: "image/jpeg" });

    class FakeImage {
      naturalWidth = 42;
      naturalHeight = 7;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });

    try {
      const result = await readBackdropImageFile(file);
      expect(result.imageWidth).toBe(42);
      expect(result.imageHeight).toBe(7);
      expect(result.bytes.length).toBe(bytes.length);
      expect(result.format).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a file that is not a recognized image format", async () => {
    const file = new File(["not an image"], "backdrop.jpg", { type: "image/jpeg" });

    await expect(readBackdropImageFile(file)).rejects.toThrow(
      "That file is not a recognized image format (JPEG, PNG, WebP, or GIF).",
    );
  });
});
