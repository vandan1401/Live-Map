// One-off: writes the M7 PWA image assets — a house/plot glyph (the app is a plot map)
// as brand-purple square PNGs for the web manifest and apple-touch-icon (spec/07,
// /review finding #6 — a flat colour tile has no mark), plus a share→add-to-home-screen
// illustration for InstallInstructions.tsx (/review finding #4). No image-processing
// dependency — hand-rolled PNG encoding via Node's built-in zlib, since nothing in
// package.json rasterises SVG. Not part of the build; run once, output committed.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BRAND_PURPLE = [0x86, 0x3b, 0xff]; // #863bff, matches favicon.svg / theme-color
const WHITE = [0xff, 0xff, 0xff];

function sign([ax, ay], [bx, by], [cx, cy]) {
  return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
}

function pointInTriangle(pt, v1, v2, v3) {
  const d1 = sign(pt, v1, v2);
  const d2 = sign(pt, v2, v3);
  const d3 = sign(pt, v3, v1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function pointInRect([x, y], [x0, y0], [x1, y1]) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Normalised [0,1] coordinates, y down — a roof triangle over a body rectangle with a
// cut-out door, simple enough to stay legible at 180px and still read as a mark at 512px.
const ROOF = [
  [0.5, 0.16],
  [0.2, 0.48],
  [0.8, 0.48],
];
const BODY = [
  [0.28, 0.48],
  [0.72, 0.82],
];
const DOOR = [
  [0.43, 0.63],
  [0.57, 0.82],
];

function houseIconPng(size) {
  const isMark = (px, py) => {
    const pt = [px / size, py / size];
    if (pointInRect(pt, DOOR[0], DOOR[1])) return false;
    if (pointInRect(pt, BODY[0], BODY[1])) return true;
    return pointInTriangle(pt, ROOF[0], ROOF[1], ROOF[2]);
  };
  return rgbPng(size, size, (x, y) => (isMark(x + 0.5, y + 0.5) ? WHITE : BRAND_PURPLE));
}

// Device-free install-flow diagram for InstallInstructions.tsx (spec/07 §2.9 / plan
// docs/plans/07.md §2.9 pre-authorised this: "otherwise a simple annotated static image
// is acceptable — this is UI content, not logic" — no real device was available this
// session to capture an actual Safari screenshot). Three glyphs, purely geometric (no
// font rendering available in this pipeline): a share-sheet icon, an arrow, and an
// add-to-home-screen icon — the same visual shorthand iOS itself uses.
const ILLUSTRATION_WIDTH = 480;
const ILLUSTRATION_HEIGHT = 160;

function installIllustrationPng() {
  const shapes = {
    // Share icon: an open-top tray with an arrow rising out of it.
    trayBottom: [[40, 108], [120, 120]],
    trayLeft: [[40, 70], [52, 120]],
    trayRight: [[108, 70], [120, 120]],
    shareArrowShaft: [[74, 50], [86, 95]],
    // Chevron pointing at the add-to-home icon.
    chevronShaft: [[190, 74], [246, 86]],
    // Outline square with a centred plus — the iOS "Add to Home Screen" glyph.
    addOuter: [[340, 40], [440, 120]],
    addInner: [[347, 47], [433, 113]],
    plusH: [[363, 74], [417, 86]],
    plusV: [[384, 55], [396, 105]],
  };
  const shareArrowHead = [[80, 36], [62, 60], [98, 60]];
  const chevronHead = [[280, 80], [246, 60], [246, 100]];

  const isMark = (x, y) => {
    const pt = [x, y];
    if (pointInRect(pt, shapes.trayBottom[0], shapes.trayBottom[1])) return true;
    if (pointInRect(pt, shapes.trayLeft[0], shapes.trayLeft[1])) return true;
    if (pointInRect(pt, shapes.trayRight[0], shapes.trayRight[1])) return true;
    if (pointInRect(pt, shapes.shareArrowShaft[0], shapes.shareArrowShaft[1])) return true;
    if (pointInTriangle(pt, shareArrowHead[0], shareArrowHead[1], shareArrowHead[2])) return true;
    if (pointInRect(pt, shapes.chevronShaft[0], shapes.chevronShaft[1])) return true;
    if (pointInTriangle(pt, chevronHead[0], chevronHead[1], chevronHead[2])) return true;
    if (pointInRect(pt, shapes.addOuter[0], shapes.addOuter[1]) && !pointInRect(pt, shapes.addInner[0], shapes.addInner[1])) return true;
    if (pointInRect(pt, shapes.plusH[0], shapes.plusH[1])) return true;
    if (pointInRect(pt, shapes.plusV[0], shapes.plusV[1])) return true;
    return false;
  };

  return rgbPng(ILLUSTRATION_WIDTH, ILLUSTRATION_HEIGHT, (x, y) => (isMark(x + 0.5, y + 0.5) ? BRAND_PURPLE : WHITE));
}

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function rgbPng(width, height, colorAt) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLen = width * 3;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowLen + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const iconsDir = path.resolve(import.meta.dirname, "../public/icons");
mkdirSync(iconsDir, { recursive: true });

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(path.join(iconsDir, name), houseIconPng(size));
  console.log(`wrote icons/${name} (${size}x${size})`);
}

const imagesDir = path.resolve(import.meta.dirname, "../public/images");
mkdirSync(imagesDir, { recursive: true });
writeFileSync(path.join(imagesDir, "install-instructions.png"), installIllustrationPng());
console.log(`wrote images/install-instructions.png (${ILLUSTRATION_WIDTH}x${ILLUSTRATION_HEIGHT})`);
