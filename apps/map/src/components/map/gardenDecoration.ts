import type { DecorShape } from "./colonyModel.ts";
import { boundsOf } from "./colonyModel.ts";
import { parsePlotPoints } from "../../lib/colony/plotGeometry.ts";

// "Decorate the gardens yourself" (owner ask, 2026-08-22): a garden/park polygon gets a
// flat olive base plus a scatter of two-tone blob clusters standing in for the tree/bush
// massing in the owner's reference render — there is no per-colony photo for this the way
// canvasPatterns.ts's grass texture has one, so this generates it. Split out of
// drawColony.ts for invariant 7's 250-line cap.

export interface GardenBlob {
  x: number;
  y: number;
  r: number;
  light: boolean; // which of the theme's two blob shades this one uses
}

// Deterministic, not Math.random(): drawColony.ts repaints every frame during a pan/zoom
// gesture, and a re-rolled scatter would visibly swim across the ground on every repaint.
// Seeded from the shape's own `d` string, so the same garden always gets the same layout
// and two different gardens don't get an identical one (mirrors the pipeline's own
// tree-scatter seeding convention — tools/pipeline's Tier 2 rule "seeded from the colony
// id, not random()/the clock").
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One blob per ~180 sq units of the polygon's bbox, bounded so a sliver garden gets at
// least a couple of blobs and a huge one doesn't paint hundreds of circles per frame.
const AREA_PER_BLOB = 180;
const MIN_BLOBS = 3;
const MAX_BLOBS = 28;
const MIN_RADIUS = 1.6;
const RADIUS_SPREAD = 3.2;

const blobCache = new WeakMap<DecorShape, GardenBlob[]>();

export function gardenBlobsFor(shape: DecorShape): GardenBlob[] {
  const cached = blobCache.get(shape);
  if (cached) return cached;

  const points = parsePlotPoints(shape.d);
  let blobs: GardenBlob[] = [];
  if (points.length >= 3) {
    const bbox = boundsOf(points);
    const w = bbox.maxX - bbox.minX;
    const h = bbox.maxY - bbox.minY;
    const rand = mulberry32(hashSeed(shape.d));
    const count = Math.max(MIN_BLOBS, Math.min(MAX_BLOBS, Math.round((w * h) / AREA_PER_BLOB)));
    for (let i = 0; i < count; i++) {
      blobs.push({
        x: bbox.minX + rand() * w,
        y: bbox.minY + rand() * h,
        r: MIN_RADIUS + rand() * RADIUS_SPREAD,
        light: rand() > 0.5,
      });
    }
  }
  blobCache.set(shape, blobs);
  return blobs;
}
