import { describe, expect, it } from "vitest";
import { resolveColonyTheme } from "./colonyTheme.ts";

// docs/plans/40.md: a colony's resolved status list overlays the three CSS-variable defaults, so
// a custom status — or a re-coloured built-in — paints with no stylesheet change.
// jsdom resolves no custom properties, so every CSS-read colour here is the MISSING magenta; what
// matters is which entries the overlay adds or replaces.
describe("resolveColonyTheme — colony statuses", () => {
  const statuses = [
    { key: "available", label: "Available", colour: "#112233" },
    { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
  ];

  it("adds a custom status's colour to the theme", () => {
    expect(resolveColonyTheme(undefined, statuses).status.sold_to_investors).toBe("#9333ea");
  });

  it("a declared colour replaces the built-in default for the same key", () => {
    expect(resolveColonyTheme(undefined, statuses).status.available).toBe("#112233");
  });

  it("keeps the built-in keys the list does not mention", () => {
    expect(Object.keys(resolveColonyTheme(undefined, statuses).status).sort()).toEqual(
      ["available", "booked", "registered", "sold_to_investors"].sort(),
    );
  });

  it("is unchanged when no list is given", () => {
    expect(Object.keys(resolveColonyTheme().status).sort()).toEqual(["available", "booked", "registered"]);
  });
});
