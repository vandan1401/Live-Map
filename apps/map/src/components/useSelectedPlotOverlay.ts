import { useEffect, useRef, type RefObject } from "react";
import type L from "leaflet";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlotBySvgId } from "../lib/db/plots.ts";
import { buildDimensionGroup } from "./plotDimensionOverlay.ts";

// Pulled out of ColonyMap.tsx to keep that file under the 250-line cap (CLAUDE.md
// invariant 7). Everything here is DOM writes on the raw parsed SVG, same discipline
// as the rest of ColonyMap.tsx's effects — this is presentation glue, not a reusable
// domain hook, so it stays paired with ColonyMap.tsx rather than moving to lib/.

// Fixed rather than the map's maxZoom (4) — maxZoom framed only 2-3 neighbouring
// plots (owner feedback: "too much zoomed in"), losing the surrounding context that
// makes the selection meaningful. A first-pass mid-range level, not a measured one;
// tune further after a look on a real phone (same caveat as ZOOM_DETAIL_THRESHOLD in
// ColonyMap.tsx).
const SELECT_ZOOM = 2;

export function useSelectedPlotOverlay(
  svgRef: RefObject<SVGSVGElement | null>,
  mapRef: RefObject<L.Map | null>,
  clientRef: RefObject<SupabaseClient | null>,
  colonyId: string,
  selectedId: string | null,
): void {
  // Remembers where a raised plot/label came from so deselecting restores the
  // original paint order exactly, instead of leaving them permanently drawn on top.
  const raisedPlotRef = useRef<{ el: Element; nextSibling: Element | null } | null>(null);
  const raisedLabelRef = useRef<{ el: Element; nextSibling: Element | null } | null>(null);

  // Selected plot gets .is-selected — scale only, never a fill/stroke change (fill
  // belongs to status; the border was removed on request). The SVG is raw parsed
  // markup, not a React tree, so this has to be a direct DOM write, same pattern as
  // data-status elsewhere. Also reparents the node to the end of its <g> so it paints
  // above every other plot/road/tree/label (SVG has no reliable z-index), restoring
  // the previous selection's original position first so paint order never drifts.
  //
  // Selecting a plot also focuses labels (owner ask): every other plot's label hides,
  // and the selected plot's own label — which the raise above would otherwise paint
  // over, since labels sit earlier in the <g> than a freshly-reparented plot — gets
  // reparented alongside it so it stays readable on top. Found via `data-plot`, not by
  // matching text content against the svg id (a real bug this replaced: the fixture's
  // label text is a bare plot number, e.g. "1", not the block-number pair a text match
  // assumed — the match never succeeded, so every selection blanked every label).
  //
  // Selecting also pans and zooms the map onto the plot (owner ask) — to SELECT_ZOOM
  // above, not the map's maxZoom. Same north-is-up Y-flip math PlotSearch's selection
  // used to do inline in ColonyMap.tsx before this hook existed to unify both entry
  // points; reads viewBox directly off the parsed SVG rather than threading VIEW_BOX
  // through as another parameter.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    if (raisedPlotRef.current) {
      const { el, nextSibling } = raisedPlotRef.current;
      el.parentNode?.insertBefore(el, nextSibling);
      raisedPlotRef.current = null;
    }
    if (raisedLabelRef.current) {
      const { el, nextSibling } = raisedLabelRef.current;
      el.parentNode?.insertBefore(el, nextSibling);
      raisedLabelRef.current = null;
    }

    svg
      .querySelectorAll(".plot.is-selected")
      .forEach((el) => el.classList.remove("is-selected"));
    svg
      .querySelectorAll(".plot-label.is-focused-label")
      .forEach((el) => el.classList.remove("is-focused-label"));
    svg.classList.toggle("has-selection", Boolean(selectedId));

    if (selectedId) {
      const el = svg.querySelector(`#${selectedId}`);
      if (el) {
        el.classList.add("is-selected");
        raisedPlotRef.current = { el, nextSibling: el.nextElementSibling };
        el.parentNode?.appendChild(el);

        const map = mapRef.current;
        if (map) {
          const bbox = (el as SVGGraphicsElement).getBBox();
          // L.svgOverlay's bounds put SVG row 0 at the map's north edge (standard
          // image-overlay convention) — lat runs opposite to y.
          const viewBoxHeight = svg.viewBox.baseVal.height;
          const lat = viewBoxHeight - (bbox.y + bbox.height / 2);
          const lng = bbox.x + bbox.width / 2;
          map.setView([lat, lng], SELECT_ZOOM, { animate: true });
        }
      }

      const labelEl = svg.querySelector(`.plot-label[data-plot="${selectedId}"]`);
      if (labelEl) {
        labelEl.classList.add("is-focused-label");
        raisedLabelRef.current = { el: labelEl, nextSibling: labelEl.nextElementSibling };
        // Same parent as the plot (<g class="site">), appended after it so it paints
        // on top — NOT the svg root. Moving it to a different parent than the one
        // `nextSibling` still lives in breaks the restore above: `el.parentNode`
        // would then be the svg root while `nextSibling` is still a child of
        // <g class="site">, and insertBefore throws "not a child of this node" (a
        // real, reproduced crash — the plot's own reparent doesn't have this problem
        // because appendChild there targets the same <g> it already lives in).
        labelEl.parentNode?.appendChild(labelEl);
      }
    }
  }, [svgRef, mapRef, selectedId]);

  // Length/breadth dimension callout for the selected plot — a small, separate fetch
  // from PlotDetailSheet's own load (fetchPlotBySvgId again) since the sheet owns its
  // own data lifecycle and this only needs two numbers off the same row. Appended to
  // the SVG root itself, not the reordered <g class="site">, so it always paints above
  // everything regardless of the plot-raising effect above.
  useEffect(() => {
    const svg = svgRef.current;
    const client = clientRef.current;
    if (!svg) return;
    svg.querySelector(".plot-dimensions")?.remove();
    if (!selectedId || !client) return;

    let cancelled = false;
    fetchPlotBySvgId(client, colonyId, selectedId)
      .then((plot) => {
        if (cancelled || !plot) return;
        const currentSvg = svgRef.current;
        const plotEl = currentSvg?.querySelector(`#${selectedId}`) as SVGGraphicsElement | null;
        if (!currentSvg || !plotEl) return;
        currentSvg.querySelector(".plot-dimensions")?.remove();
        currentSvg.appendChild(
          buildDimensionGroup(plotEl.getBBox(), plot.length_ft, plot.breadth_ft),
        );
      })
      .catch((error: unknown) => {
        console.error("failed to load plot dimensions:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [svgRef, clientRef, colonyId, selectedId]);
}
