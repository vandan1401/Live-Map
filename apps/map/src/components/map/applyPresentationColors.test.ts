import { describe, expect, it } from "vitest";
import { applyStatusColorOverrides } from "./applyPresentationColors.ts";
import { resolvePresentationConfig } from "../../lib/colony/presentationConfig.ts";

// Compared against the real default config throughout, not a hardcoded hex literal
// (docs/plans/27.md §1: "no new hex literal may appear in any .ts/.tsx file" — D-004's
// only colour source is colony-theme.css) — the sentinel colour used to prove the override
// path works is the one literal exempt from that, since no real theme ever defines it.
const DEFAULT_STATUS_COLORS = resolvePresentationConfig().statusColors;
const SENTINEL_OVERRIDE_COLOR = "#123456";

describe("applyStatusColorOverrides", () => {
  it("sets every status colour variable from the resolved config", () => {
    const root = document.createElement("div");
    applyStatusColorOverrides("no-such-colony", root);
    expect(root.style.getPropertyValue("--colony-status-available")).toBe(DEFAULT_STATUS_COLORS.available);
    expect(root.style.getPropertyValue("--colony-status-booked")).toBe(DEFAULT_STATUS_COLORS.booked);
    expect(root.style.getPropertyValue("--colony-status-registered")).toBe(DEFAULT_STATUS_COLORS.registered);
  });

  it("applies a colony-specific colour override, then reverts on a colony with none (no leak)", () => {
    const root = document.createElement("div");
    // Injected fixture (docs/plans/27.md §2.4) — resolvePresentationConfig(colonyId)'s
    // shallow-merge shape, standing in for a real colony override without needing one
    // checked into presentation.json.
    const overridden = {
      ...resolvePresentationConfig(),
      statusColors: { ...DEFAULT_STATUS_COLORS, booked: SENTINEL_OVERRIDE_COLOR },
    };
    applyStatusColorOverrides("some-colony", root, overridden);
    expect(root.style.getPropertyValue("--colony-status-booked")).toBe(SENTINEL_OVERRIDE_COLOR);

    // Switching to a colony with no override must explicitly revert every property, not
    // just leave the previous colony's inline style in place.
    applyStatusColorOverrides("no-such-colony", root);
    expect(root.style.getPropertyValue("--colony-status-booked")).toBe(DEFAULT_STATUS_COLORS.booked);
  });
});
