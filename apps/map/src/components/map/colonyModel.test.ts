/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseColonyModel } from "./colonyModel.ts";
import { pickPlotAt } from "./plotPicker.ts";
import { polygonCentroid } from "../../lib/colony/plotGeometry.ts";
import { resolveColonyTheme } from "./colonyTheme.ts";

// Read with plain fs, not a `?raw` import — same reasoning as ColonyMap.test.tsx and
// scripts/import-seed.ts: the fixture arrives at runtime, never compiled into the app.
const fixtureSvg = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../fixtures/shree-vatika-2/colony.svg"),
  "utf-8",
);

describe("parseColonyModel", () => {
  it("finds all 26 plots in the shared fixture", () => {
    // Replaces ColonyMap.test.tsx's `querySelectorAll(".plot")` count, which asserted on a
    // DOM that no longer exists. This is the same guarantee one layer down, and it now
    // survives a renderer swap instead of being coupled to one.
    expect(parseColonyModel(fixtureSvg).plots).toHaveLength(26);
  });

  it("drops trees entirely", () => {
    const withTrees = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
      <defs><symbol id="tree-canopy"><circle class="tree-crown" r="4"/></symbol></defs>
      <path class="plot" id="plot-01" d="M0,0 L10,0 L10,10 L0,10 Z"/>
      <use class="tree" href="#tree-canopy" x="5" y="5" width="6" height="6"/>
      <path class="tree" d="M20,20 L30,20 L30,30 Z"/>
    </svg>`;
    const model = parseColonyModel(withTrees);
    expect(model.plots).toHaveLength(1);
    expect(model.decor).toHaveLength(0);
  });

  it("reads the viewBox rather than assuming a size", () => {
    const model = parseColonyModel(fixtureSvg);
    expect(model.width).toBe(1000); // contract/SPEC.md: always 1000
    expect(model.height).toBeGreaterThan(0);
  });

  it("falls back to upright and no explicit size when a label carries neither attribute", () => {
    // fixtures/shree-vatika-2/colony.svg predates data-rotation/data-label-height
    // (contract/SPEC.md:39), so every plot label in it must take the fallback path.
    const plotLabels = parseColonyModel(fixtureSvg).labels.filter((l) => l.kind === "plot");
    expect(plotLabels.length).toBeGreaterThan(0);
    for (const label of plotLabels) {
      expect(label.rotation).toBe(0);
      expect(label.size).toBeNull();
    }
  });

  it("reads data-rotation and data-label-height when the pipeline supplied them", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
      <text class="plot-label" data-plot="plot-01" data-rotation="-21.49" data-label-height="2.84" x="10" y="20">7</text>
    </svg>`;
    const [label] = parseColonyModel(svg).labels;
    expect(label).toMatchObject({ rotation: -21.49, size: 2.84, plotId: "plot-01", text: "7" });
  });

  it("keeps every feature label in the fixture, including the rotated one", () => {
    // The pipeline does not emit feature labels yet — pipeline/export/svg.py names the
    // class only in its fallback CSS (PROGRESS.md -> Deferred), which is why real colonies
    // show no road texts. The renderer must already handle them so they appear the moment
    // that gap is closed; the hand-authored fixture is the only place to prove it today.
    const featureLabels = parseColonyModel(fixtureSvg).labels.filter((l) => l.kind === "feature");
    expect(featureLabels).toHaveLength(11);
    expect(featureLabels.map((l) => l.text)).toContain("9.0 M W ROAD");
    const pathway = featureLabels.find((l) => l.text === "6.0 M W PATHWAY");
    expect(pathway?.rotation).toBe(-90);
  });
});

describe("pickPlotAt", () => {
  it("picks every fixture plot from its own centroid", () => {
    const model = parseColonyModel(fixtureSvg);
    for (const plot of model.plots) {
      const [cx, cy] = polygonCentroid(plot.points);
      expect(pickPlotAt(model, cx, cy)?.id).toBe(plot.id);
    }
  });

  it("returns null for empty space rather than the nearest plot", () => {
    const model = parseColonyModel(fixtureSvg);
    expect(pickPlotAt(model, -5000, -5000)).toBeNull();
  });
});

describe("resolveColonyTheme", () => {
  it("reads colours from CSS custom properties, not from literals in the renderer", () => {
    // D-004's regression test, which did not exist while CSS selectors did the painting.
    // If someone hardcodes a status colour in a draw call, this keeps passing — but
    // acceptance criterion 6's grep catches that. Together they cover both directions.
    const root = document.documentElement;
    root.style.setProperty("--colony-status-booked", "#123456");
    root.style.setProperty("--colony-plot-stroke-width", "0.5");
    expect(resolveColonyTheme(root).status.booked).toBe("#123456");
    root.style.setProperty("--colony-status-booked", "#654321");
    expect(resolveColonyTheme(root).status.booked).toBe("#654321");
    root.style.removeProperty("--colony-status-booked");
  });

  it("keeps the pinned 0.5 stroke width when the variable is unreadable", () => {
    const el = document.createElement("div");
    expect(resolveColonyTheme(el).plotStrokeWidth).toBe(0.5);
  });
});
