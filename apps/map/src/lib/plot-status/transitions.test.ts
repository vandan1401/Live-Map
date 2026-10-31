import { describe, expect, it } from "vitest";
import { isLegalTransition, legalNextStatuses } from "./transitions.ts";
import type { ColonyStatus, PlotStatus } from "../db/types.ts";

describe("isLegalTransition — legal pairs", () => {
  it("available -> booked", () => {
    expect(isLegalTransition("available", "booked")).toBe(true);
  });
  it("booked -> registered", () => {
    expect(isLegalTransition("booked", "registered")).toBe(true);
  });
  it("booked -> available", () => {
    expect(isLegalTransition("booked", "available")).toBe(true);
  });
  it("registered -> available", () => {
    expect(isLegalTransition("registered", "available")).toBe(true);
  });
});

describe("isLegalTransition — illegal pairs", () => {
  it("available -> available (self)", () => {
    expect(isLegalTransition("available", "available")).toBe(false);
  });
  it("available -> registered", () => {
    expect(isLegalTransition("available", "registered")).toBe(false);
  });
  it("booked -> booked (self)", () => {
    expect(isLegalTransition("booked", "booked")).toBe(false);
  });
  it("registered -> registered (self)", () => {
    expect(isLegalTransition("registered", "registered")).toBe(false);
  });
  it("registered -> booked", () => {
    expect(isLegalTransition("registered", "booked")).toBe(false);
  });
});

describe("isLegalTransition — every ordered pair is covered", () => {
  it("has exactly 4 legal and 5 illegal pairs across the 3 statuses", () => {
    const statuses: PlotStatus[] = ["available", "booked", "registered"];
    let legal = 0;
    let illegal = 0;
    for (const from of statuses) {
      for (const to of statuses) {
        if (isLegalTransition(from, to)) legal++;
        else illegal++;
      }
    }
    expect(legal).toBe(4);
    expect(illegal).toBe(5);
  });
});

const INVESTORS: ColonyStatus[] = [
  { key: "available", label: "Available", colour: "#aa8800" },
  { key: "booked", label: "Booked", colour: "#2244cc" },
  { key: "registered", label: "Registry done", colour: "#cc1144" },
  { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
  { key: "on_hold", label: "On hold", colour: "#6b7280" },
];

describe("isLegalTransition — custom statuses (docs/plans/40.md)", () => {
  it("a custom status moves to and from available", () => {
    expect(isLegalTransition("available", "sold_to_investors", INVESTORS)).toBe(true);
    expect(isLegalTransition("sold_to_investors", "available", INVESTORS)).toBe(true);
  });
  it("custom statuses move freely between each other", () => {
    expect(isLegalTransition("sold_to_investors", "on_hold", INVESTORS)).toBe(true);
    expect(isLegalTransition("on_hold", "sold_to_investors", INVESTORS)).toBe(true);
  });
  it("moves directly to and from booked and registered (docs/plans/41.md, D-054)", () => {
    expect(isLegalTransition("booked", "sold_to_investors", INVESTORS)).toBe(true);
    expect(isLegalTransition("registered", "sold_to_investors", INVESTORS)).toBe(true);
    expect(isLegalTransition("sold_to_investors", "booked", INVESTORS)).toBe(true);
    expect(isLegalTransition("sold_to_investors", "registered", INVESTORS)).toBe(true);
    expect(isLegalTransition("booked", "on_hold", INVESTORS)).toBe(true);
  });
  it("a self-move is still illegal for a custom status", () => {
    expect(isLegalTransition("sold_to_investors", "sold_to_investors", INVESTORS)).toBe(false);
  });
  it("refuses a move to or from a key the colony does not list", () => {
    expect(isLegalTransition("available", "mystery", INVESTORS)).toBe(false);
    expect(isLegalTransition("mystery", "available", INVESTORS)).toBe(false);
  });
  it("a colony that omits booked cannot book, but keeps its other rules", () => {
    const noBooked = INVESTORS.filter((s) => s.key !== "booked");
    expect(isLegalTransition("available", "booked", noBooked)).toBe(false);
    expect(isLegalTransition("registered", "available", noBooked)).toBe(true);
  });
  it("the built-in rules are unchanged when a colony adds statuses", () => {
    expect(isLegalTransition("available", "booked", INVESTORS)).toBe(true);
    expect(isLegalTransition("booked", "registered", INVESTORS)).toBe(true);
    expect(isLegalTransition("available", "registered", INVESTORS)).toBe(false);
    expect(isLegalTransition("registered", "booked", INVESTORS)).toBe(false);
  });
});

describe("legalNextStatuses", () => {
  const keys = (from: string) => legalNextStatuses(from, INVESTORS).map((s) => s.key);
  it("lists the legal targets in the colony's legend order", () => {
    expect(keys("available")).toEqual(["booked", "sold_to_investors", "on_hold"]);
    expect(keys("booked")).toEqual(["available", "registered", "sold_to_investors", "on_hold"]);
    expect(keys("sold_to_investors")).toEqual(["available", "booked", "registered", "on_hold"]);
    expect(keys("registered")).toEqual(["available", "sold_to_investors", "on_hold"]);
  });
});
