import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_KEYS,
  MAX_STATUSES,
  findDuplicateStatusKeys,
  resolveColonyStatuses,
  statusColourMap,
  statusLabelMap,
} from "./colonyStatuses.ts";
import type { ColonyStatus } from "../db/types.ts";

// The presentation.json layer (docs/plans/27.md) as the app resolves it for a colony with no
// declared list: labels and colours for exactly the three built-in keys.
const presentation = {
  statusLabels: { available: "Available", booked: "Booked", registered: "Registry done" },
  statusColors: { available: "#aa8800", booked: "#2244cc", registered: "#cc1144" },
};

const withInvestors: ColonyStatus[] = [
  { key: "available", label: "Available", colour: "#aa8800" },
  { key: "booked", label: "Booked", colour: "#2244cc" },
  { key: "registered", label: "Registry done", colour: "#cc1144" },
  { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
];

describe("resolveColonyStatuses", () => {
  it("falls back to the built-in three, in order, when the colony declares none", () => {
    expect(resolveColonyStatuses(null, presentation).map((s) => s.key)).toEqual([
      ...DEFAULT_STATUS_KEYS,
    ]);
    expect(resolveColonyStatuses(undefined, presentation)).toHaveLength(3);
  });

  it("takes the built-in labels/colours from presentation.json, so a per-colony override still works", () => {
    const bharat = {
      ...presentation,
      statusColors: { ...presentation.statusColors, booked: "#2ba1cc" },
    };
    const booked = resolveColonyStatuses(null, bharat).find((s) => s.key === "booked");
    expect(booked?.colour).toBe("#2ba1cc");
  });

  it("uses the declared list verbatim, in declared order, ignoring presentation.json", () => {
    const declared: ColonyStatus[] = [
      { key: "available", label: "Open", colour: "#00aa00" },
      { key: "sold_to_investors", label: "Sold to investors", colour: "#9333ea" },
    ];
    const bharat = {
      ...presentation,
      statusColors: { ...presentation.statusColors, available: "#111111" },
    };
    expect(resolveColonyStatuses(declared, bharat)).toEqual(declared);
  });

  it("does not hand back the caller's array (a later mutation must not leak into the cache)", () => {
    expect(resolveColonyStatuses(withInvestors, presentation)).not.toBe(withInvestors);
  });
});

describe("statusLabelMap / statusColourMap", () => {
  it("key by status key, including custom ones", () => {
    expect(statusLabelMap(withInvestors).sold_to_investors).toBe("Sold to investors");
    expect(statusColourMap(withInvestors).sold_to_investors).toBe("#9333ea");
    expect(statusColourMap(withInvestors).available).toBe("#aa8800");
  });
});

describe("findDuplicateStatusKeys", () => {
  it("returns each repeated key once, and nothing for a clean list", () => {
    expect(findDuplicateStatusKeys(withInvestors)).toEqual([]);
    expect(
      findDuplicateStatusKeys([...withInvestors, withInvestors[1], withInvestors[1]]),
    ).toEqual(["booked"]);
  });
});

describe("limits", () => {
  it("caps a colony at 8 statuses (the legend is one row on a phone)", () => {
    expect(MAX_STATUSES).toBe(8);
  });
});
