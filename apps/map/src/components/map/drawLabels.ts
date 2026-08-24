import type { ColonyModel, MapLabel } from "./colonyModel.ts";
import { MAP_FONT_FAMILY, type ColonyTheme } from "./colonyTheme.ts";
import type { DrawState } from "./drawColony.ts";

// Every size here is in SVG user units, exactly as the CSS rules it replaces were: the
// context is already scaled, so a 12 here renders 12*scale px and grows with zoom the way
// .feature-label did inside the overlay. Dividing by the scale would pin these to constant
// screen pixels, which is a different design nobody asked for (/review, 2026-08-22).
//
// Text, split out of drawColony.ts for invariant 7's 250-line cap — and it earns its own
// file anyway, being 55% of an un-culled frame (20.6 ms of 37.5 ms, docs/plans/18.md §1).
// Culling to the viewport is the single largest optimisation in this renderer and is
// mandatory, not a nicety: desktop measured dpr 1.25, and a phone pushes ~2.7x the pixels.

// Owner's reference render: plain bold numbers, no halo, sitting bare. 12px/1.5px-stroke
// was wider than a Jai Dev plot; the stroke went and the size came down.
const PLOT_LABEL_DEFAULT_SIZE = 6;
const FEATURE_LABEL_SIZE = 12;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function inView(label: MapLabel, b: Bounds): boolean {
  return label.x >= b.minX && label.x <= b.maxX && label.y >= b.minY && label.y <= b.maxY;
}

export function drawLabels(
  ctx: CanvasRenderingContext2D,
  model: ColonyModel,
  theme: ColonyTheme,
  state: DrawState,
  bounds: Bounds,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const label of model.labels) {
    if (!inView(label, bounds)) continue;
    const isPlot = label.kind === "plot";
    const isSelectedLabel = isPlot && label.plotId === state.selectedId;
    // Selecting a plot focuses labels (owner ask): every other plot's label hides, and the
    // selected plot's own stays — even while zoomed out, since a label the user
    // deliberately selected should not disappear. The zoom check has to come AFTER that
    // exemption; testing it first hid the selected label too, contradicting this comment
    // and losing what the deleted CSS won on specificity (/review, 2026-08-22).
    if (isPlot && !state.showPlotLabels && !isSelectedLabel) continue;
    if (isPlot && state.selectedId && !isSelectedLabel) continue;

    // The pipeline's own data-label-height wins when the source DXF entity carried one
    // (docs/plans/19.md addendum, 2026-08-24: owner wants the DWG's exact font size, not
    // just a fixed constant) -- these fall back to a constant only when it did not.
    const size = label.size ?? (isPlot ? PLOT_LABEL_DEFAULT_SIZE : FEATURE_LABEL_SIZE);
    ctx.save();
    ctx.translate(label.x, label.y);
    if (label.rotation) ctx.rotate((label.rotation * Math.PI) / 180);
    ctx.font = `700 ${size}px ${MAP_FONT_FAMILY}`;

    // No background chip (owner reference, 2026-08-22, supersedes the 2026-08-15 white
    // pill): road names, CLUB/PARTY PLOT and court labels sit directly on the dark road /
    // green amenity fill, in --colony-feature-label-ink's now-light ink, exactly as the new
    // reference shows.
    ctx.fillStyle = isPlot ? theme.plotLabelInk : theme.featureLabelInk;
    ctx.fillText(label.text, 0, 0);
    ctx.restore();
  }
}
