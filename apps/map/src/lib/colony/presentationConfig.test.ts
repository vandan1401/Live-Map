/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePresentationConfig } from "./presentationConfig.ts";
// Asserted against the real file's own content, not a hardcoded hex/string literal
// (docs/plans/27.md §1's D-004 rule) — this also catches presentation.json drifting out
// of sync with the resolver's expectations without anyone updating this test by hand.
import presentationData from "../../config/presentation.json";

const DEFAULT = presentationData.default;

// applyStatusColorOverrides (docs/plans/27.md) writes these as an inline style on every
// colony mount, which beats colony-theme.css's own `:root` rule from then on — so the two
// files silently disagreeing would only be visible on a screen that renders before any map
// mount (login-screen.css, install-instructions.css still read the CSS rule directly). A
// real /review finding: nothing else catches that drift.
const themeCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../styles/colony-theme.css"),
  "utf-8",
);

function cssStatusColor(status: string): string | undefined {
  const match = new RegExp(`--colony-status-${status}:\\s*(#[0-9a-f]{6})`).exec(themeCss);
  return match?.[1];
}

describe("resolvePresentationConfig", () => {
  it("returns the default block when no colonyId is given", () => {
    const config = resolvePresentationConfig();
    expect(config.homeHeading).toBe(DEFAULT.homeHeading);
    expect(config.noOwnerTokens).toEqual(DEFAULT.noOwnerTokens);
    expect(config.statusLabels.registered).toBe(DEFAULT.statusLabels.registered);
    expect(config.statusColors.booked).toBe(DEFAULT.statusColors.booked);
    expect(config.dimension).toEqual(DEFAULT.dimension);
  });

  it("falls back to default for an unknown colony id", () => {
    const config = resolvePresentationConfig("no-such-colony");
    expect(config.noOwnerTokens).toEqual(DEFAULT.noOwnerTokens);
  });

  it("overrides only the keys a colony specifies, leaving the rest at default", () => {
    const config = resolvePresentationConfig("bharatkshetra");
    expect(config.noOwnerTokens).toEqual(presentationData.colonies.bharatkshetra.noOwnerTokens);
    // bharatkshetra overrides statusColors (a custom "booked" colour) -- its own override
    // block, not the shared default, is the source of truth here.
    expect(config.statusColors).toEqual(presentationData.colonies.bharatkshetra.statusColors);
    // Keys bharatkshetra does NOT specify still come from default.
    expect(config.homeHeading).toBe(DEFAULT.homeHeading);
    expect(config.dimension).toEqual(DEFAULT.dimension);
  });

  it("matches colony-theme.css's own status colours, so the two sources cannot silently drift apart", () => {
    expect(DEFAULT.statusColors.available).toBe(cssStatusColor("available"));
    expect(DEFAULT.statusColors.booked).toBe(cssStatusColor("booked"));
    expect(DEFAULT.statusColors.registered).toBe(cssStatusColor("registered"));
  });
});
