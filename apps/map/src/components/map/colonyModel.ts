import { parsePlotPoints, type Point } from "../../lib/colony/plotGeometry.ts";

// The colony SVG, parsed once into plain data the canvas renderer draws from
// (docs/plans/18.md). Deliberately holds NO Path2D and calls NO getBBox: this module runs
// in jsdom under vitest, which implements neither, and a model that needs a live browser
// is a model that cannot be unit-tested. The draw layer builds Path2D from `d` and caches
// it; bounds are computed from the ring's own points.
//
// contract/SPEC.md's class/id/data-* table is this parser's input schema. Anything not in
// that table is ignored rather than guessed at.

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PlotShape {
  id: string;
  d: string;
  points: Point[];
  bbox: BBox;
}

export interface DecorShape {
  cls: string;
  kind: string | null;
  d: string;
}

export type LabelKind = "plot" | "feature" | "entrance";

export interface MapLabel {
  kind: LabelKind;
  text: string;
  x: number;
  y: number;
  // Degrees, already in SVG's Y-down frame (contract/SPEC.md:39). Absent on the shared
  // fixture's plot labels and on any older export — 0 means upright, never "unknown".
  rotation: number;
  // null means "no data-label-height on this label" — the draw layer applies the CSS
  // default for the kind rather than inventing a size here.
  size: number | null;
  // plot labels only: the svg_id of the plot this labels, from data-plot
  plotId: string | null;
}

export interface ColonyModel {
  width: number;
  height: number;
  plots: PlotShape[];
  decor: DecorShape[];
  labels: MapLabel[];
}

const LABEL_KINDS: Record<string, LabelKind> = {
  "plot-label": "plot",
  "feature-label": "feature",
  "entrance-label": "entrance",
};

// Every class in contract/SPEC.md's table that carries geometry and is not a plot.
const DECOR_CLASSES = new Set(["site-boundary", "road", "garden", "amenity", "water"]);

function boundsOf(points: Point[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// Trees are dropped here, as they were in the SVG renderer this replaces (owner ask,
// 2026-08-22). They are pure decoration invented by the pipeline's scatter_trees(), never
// colony data, and Jai Dev Residency alone carried 1,430 of them. The pipeline still emits
// them (PROGRESS.md -> Deferred); dropping them at parse fixes every colony already
// uploaded without a rerun. Nothing downstream ever sees a tree.
function isTree(el: Element): boolean {
  return el.classList.contains("tree");
}

function readViewBox(svg: Element): { width: number; height: number } {
  const raw = svg.getAttribute("viewBox");
  if (!raw) return { width: 1000, height: 1000 };
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  // contract/SPEC.md: viewBox width is always 1000, height follows the aspect ratio.
  return { width: parts[2] || 1000, height: parts[3] || 1000 };
}

export function parseColonyModel(raw: string): ColonyModel {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement;
  const { width, height } = readViewBox(svg);

  const plots: PlotShape[] = [];
  const decor: DecorShape[] = [];
  const labels: MapLabel[] = [];

  for (const el of svg.querySelectorAll("path")) {
    if (isTree(el)) continue;
    const d = el.getAttribute("d");
    if (!d) continue;
    const cls = el.getAttribute("class") ?? "";
    if (cls === "plot") {
      const id = el.getAttribute("id");
      if (!id) continue; // a plot with no svg_id can never be selected or synced
      const points = parsePlotPoints(d);
      plots.push({ id, d, points, bbox: boundsOf(points) });
    } else if (DECOR_CLASSES.has(cls)) {
      decor.push({ cls, kind: el.getAttribute("data-kind"), d });
    }
  }

  for (const el of svg.querySelectorAll("text")) {
    const kind = LABEL_KINDS[el.getAttribute("class") ?? ""];
    if (!kind) continue;
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const x = Number(el.getAttribute("x") ?? 0);
    const y = Number(el.getAttribute("y") ?? 0);
    const rotationAttr = el.getAttribute("data-rotation");
    const heightAttr = el.getAttribute("data-label-height");
    labels.push({
      kind,
      text,
      x,
      y,
      // data-rotation is the pipeline's own baked-in value. The shared fixture predates it
      // and instead carries a literal transform="rotate(deg cx cy)" on the <text> — read
      // that as a fallback so the fixture's rotated road label keeps its rotation.
      rotation: rotationAttr !== null ? Number(rotationAttr) : rotationFromTransform(el),
      size: heightAttr !== null ? Number(heightAttr) : null,
      plotId: el.getAttribute("data-plot"),
    });
  }

  return { width, height, plots, decor, labels };
}

function rotationFromTransform(el: Element): number {
  const t = el.getAttribute("transform");
  if (!t) return 0;
  const m = /rotate\(\s*(-?[\d.]+)/.exec(t);
  return m ? Number(m[1]) : 0;
}
