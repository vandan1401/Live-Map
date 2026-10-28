import { initWasm, Resvg } from "@resvg/resvg-wasm";
import RESVG_WASM from "@resvg/resvg-wasm/index_bg.wasm";
import { renderOgSvg, type OgPlot } from "./renderOgSvg.ts";
import { resolveOgTheme } from "./theme.ts";

// WhatsApp/OpenGraph's conventional card width — resvg fits the colony's own viewBox to
// this width and keeps its native aspect ratio (colony plans are usually portrait, not the
// 1.91:1 OG convention; letterboxing that instead of cropping the layout was the simpler
// call, docs/plans/NN.md when written).
const OG_IMAGE_WIDTH = 1200;

// initWasm() throws if called twice in the same isolate — memoized so every request in a
// warm Worker reuses the first call's instantiation instead of racing/erroring on a second.
let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(RESVG_WASM);
  return wasmReady;
}

export async function renderOgPng(rawSvg: string, plots: readonly OgPlot[]): Promise<Uint8Array> {
  await ensureWasm();
  const svg = renderOgSvg(rawSvg, plots);
  const theme = resolveOgTheme();

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    background: theme.groundBase,
    // No system font store in a Worker — every label this document could have drawn is
    // already `display:none` in renderOgSvg.ts's stylesheet, so there's nothing to shape.
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return png;
}
