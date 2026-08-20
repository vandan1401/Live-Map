// The owner's local fix-and-rerun loop (spec/14, M14): open `out/<colony>/colony.{svg,json}`
// and render exactly what the app will, so a mirrored Y-flip or a dropped plot number is
// caught here rather than at upload. Read-only (D-025 moved "verified: true" to the app).
"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

// Ported by hand from apps/map/src/components/mapTexturePatterns.ts + parseColonySvg.ts
// (that module is compiled by the app's bundler; importing it here would give this page
// a build step, which D-114 rules out).
const GRASS_TILE_W = 160;
const GRASS_TILE_H = 144;
const SEAM_OVERLAP = 1;
const ROAD_TILE = 22;
const ROAD_FLECKS = [
  { x: 4, y: 6, r: 1.3, cls: "texture-road-fleck-light" },
  { x: 14, y: 3, r: 0.9, cls: "texture-road-fleck-dark" },
  { x: 19, y: 10, r: 1.5, cls: "texture-road-fleck-light" },
  { x: 8, y: 14, r: 1, cls: "texture-road-fleck-dark" },
  { x: 2, y: 19, r: 1.2, cls: "texture-road-fleck-light" },
  { x: 16, y: 18, r: 0.9, cls: "texture-road-fleck-dark" },
];
const GRASS_PHOTO_URL = "../../../apps/map/src/assets/textures/grass-satellite.jpg";

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function buildMirroredPhotoPattern(id, href, tileW, tileH) {
  const pattern = el("pattern", { id, width: String(tileW * 2), height: String(tileH * 2), patternUnits: "userSpaceOnUse" });
  const quadrants = [
    { transform: "" },
    { transform: `translate(${tileW * 2} 0) scale(-1 1)` },
    { transform: `translate(0 ${tileH * 2}) scale(1 -1)` },
    { transform: `translate(${tileW * 2} ${tileH * 2}) scale(-1 -1)` },
  ];
  for (const { transform } of quadrants) {
    const image = el("image", {
      href, x: String(-SEAM_OVERLAP), y: String(-SEAM_OVERLAP),
      width: String(tileW + SEAM_OVERLAP * 2), height: String(tileH + SEAM_OVERLAP * 2),
      preserveAspectRatio: "xMidYMid slice",
    });
    if (transform) image.setAttribute("transform", transform);
    pattern.appendChild(image);
  }
  return pattern;
}

function buildTextureDefs() {
  const defs = el("defs", {});
  const garden = buildMirroredPhotoPattern("texture-garden", GRASS_PHOTO_URL, GRASS_TILE_W, GRASS_TILE_H);
  garden.appendChild(el("rect", { width: String(GRASS_TILE_W * 2), height: String(GRASS_TILE_H * 2), class: "texture-garden-tint" }));
  defs.appendChild(garden);

  const road = el("pattern", { id: "texture-road", width: String(ROAD_TILE), height: String(ROAD_TILE), patternUnits: "userSpaceOnUse" });
  road.appendChild(el("rect", { width: String(ROAD_TILE), height: String(ROAD_TILE), class: "texture-road-base" }));
  for (const { x, y, r, cls } of ROAD_FLECKS) road.appendChild(el("circle", { cx: String(x), cy: String(y), r: String(r), class: cls }));
  defs.appendChild(road);
  return defs;
}

function parseColonySvg(raw) {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("colony.svg did not parse as XML");
  const svg = doc.documentElement;
  svg.classList.add("colony-svg-root");
  svg.appendChild(buildTextureDefs());
  return svg;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}
async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

function renderCounters(manifest, config) {
  const list = document.getElementById("counter-list");
  list.innerHTML = "";
  const counts = { garden: 0, amenity: 0, water: 0 };
  let totalArea = 0;
  for (const f of manifest.features) {
    counts[f.class] = (counts[f.class] || 0) + 1;
    totalArea += f.area_sqft || 0;
  }
  for (const p of manifest.plots) totalArea += p.area_sqft || 0;

  const plotMismatch = config && manifest.plots.length !== config.expected_plots;
  addRow(list, "Plots", manifest.plots.length + (config ? ` / ${config.expected_plots} expected` : ""), plotMismatch);
  addRow(list, "Gardens", counts.garden);
  addRow(list, "Amenities", counts.amenity);
  addRow(list, "Water", counts.water);
  addRow(list, "Total site area (sqft)", totalArea.toLocaleString());
}

function addRow(list, label, value, mismatch) {
  const row = document.createElement("div");
  if (mismatch) row.className = "vp-counter-mismatch";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = String(value);
  row.append(dt, dd);
  list.appendChild(row);
}

function renderVerifiedBadge(manifest) {
  const badge = document.getElementById("verified-badge");
  const verified = manifest.colony.verified === true;
  badge.textContent = verified ? "verified: true" : "verified: false";
  badge.className = `vp-badge ${verified ? "is-ok" : "is-bad"}`;
}

function showPlotDetail(plot) {
  const list = document.getElementById("plot-detail-list");
  const empty = document.getElementById("plot-detail-empty");
  list.innerHTML = "";
  const rows = [
    ["svg_id", plot.svg_id],
    ["area_sqft", plot.area_sqft],
    ["length_ft × breadth_ft", `${plot.length_ft} × ${plot.breadth_ft}`],
    ["facing", plot.facing],
    ["is_corner", plot.is_corner],
  ];
  for (const [label, value] of rows) addRow(list, label, value, false);
  list.hidden = false;
  empty.hidden = true;
}

function attachPlotHandlers(svgRoot, manifest) {
  const plotsById = new Map(manifest.plots.map((p) => [p.svg_id, p]));
  let selected = null;
  let selectedLabel = null;
  svgRoot.querySelectorAll(".plot").forEach((node) => {
    node.addEventListener("click", () => {
      const plot = plotsById.get(node.id);
      if (!plot) return;
      if (selected) selected.classList.remove("is-selected");
      if (selectedLabel) selectedLabel.classList.remove("is-focused-label");
      node.classList.add("is-selected");
      svgRoot.classList.add("has-selection");
      selected = node;
      // .has-selection hides every .plot-label except .is-focused-label (plot-selection.css).
      selectedLabel = svgRoot.querySelector(`.plot-label[data-plot="${node.id}"]`);
      if (selectedLabel) selectedLabel.classList.add("is-focused-label");
      showPlotDetail(plot);
    });
  });
}

function wireOverlay(sourceUrl) {
  const toggle = document.getElementById("overlay-toggle");
  const opacity = document.getElementById("overlay-opacity");
  const img = document.getElementById("source-overlay");
  toggle.disabled = !sourceUrl;
  opacity.disabled = !sourceUrl;
  toggle.checked = false;
  img.hidden = true;
  if (!sourceUrl) return;
  img.src = sourceUrl;
  const apply = () => {
    img.hidden = !toggle.checked;
    img.style.opacity = opacity.value;
  };
  toggle.onchange = apply;
  opacity.oninput = apply;
}

function showError(message) {
  const box = document.getElementById("fetch-error");
  if (!message) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = message;
}

async function loadColony(id) {
  showError("");
  document.getElementById("svg-container").innerHTML = "";
  document.getElementById("plot-detail-list").hidden = true;
  document.getElementById("plot-detail-empty").hidden = false;

  let config = null;
  try {
    config = await fetchJson(`../colonies/${id}.json`);
  } catch {
    // Config is only used for the expected_plots comparison — its absence shouldn't
    // block rendering an otherwise-valid export.
  }

  const [svgText, manifest] = await Promise.all([
    fetchText(`../out/${id}/colony.svg`),
    fetchJson(`../out/${id}/colony.json`),
  ]);

  const svgRoot = parseColonySvg(svgText);
  document.getElementById("svg-container").appendChild(svgRoot);
  renderVerifiedBadge(manifest);
  renderCounters(manifest, config);
  attachPlotHandlers(svgRoot, manifest);

  const sourceUrl = `../out/${id}/source.png`;
  wireOverlay((await urlExists(sourceUrl)) ? sourceUrl : null);
}

function init() {
  const input = document.getElementById("colony-id");
  const params = new URLSearchParams(location.search);
  const initial = params.get("colony");
  if (initial) input.value = initial;

  const run = () => {
    const id = input.value.trim();
    if (!id) return;
    const url = new URL(location.href);
    url.searchParams.set("colony", id);
    history.replaceState(null, "", url);
    loadColony(id).catch((err) => {
      showError(
        err instanceof TypeError
          ? `Could not fetch colony data — open this page via "make serve" (http://localhost:8080/...), not file://. (${err.message})`
          : err.message,
      );
    });
  };

  document.getElementById("load-btn").addEventListener("click", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  run();
}

init();
