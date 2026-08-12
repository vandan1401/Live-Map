import { describe, expect, it } from "vitest";
import { isLegalTransition } from "./transitions.ts";
import type { PlotStatus } from "../db/types.ts";

describe("isLegalTransition — legal pairs", () => {
  it("available -> booked", () => {
    expect(isLegalTransition("available", "booked")).toBe(true);
  });
  it("available -> hold", () => {
    expect(isLegalTransition("available", "hold")).toBe(true);
  });
  it("booked -> registered", () => {
    expect(isLegalTransition("booked", "registered")).toBe(true);
  });
  it("booked -> available", () => {
    expect(isLegalTransition("booked", "available")).toBe(true);
  });
  it("hold -> available", () => {
    expect(isLegalTransition("hold", "available")).toBe(true);
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
  it("booked -> hold", () => {
    expect(isLegalTransition("booked", "hold")).toBe(false);
  });
  it("hold -> hold (self)", () => {
    expect(isLegalTransition("hold", "hold")).toBe(false);
  });
  it("hold -> booked", () => {
    expect(isLegalTransition("hold", "booked")).toBe(false);
  });
  it("hold -> registered", () => {
    expect(isLegalTransition("hold", "registered")).toBe(false);
  });
  it("registered -> registered (self)", () => {
    expect(isLegalTransition("registered", "registered")).toBe(false);
  });
  it("registered -> booked", () => {
    expect(isLegalTransition("registered", "booked")).toBe(false);
  });
  it("registered -> hold", () => {
    expect(isLegalTransition("registered", "hold")).toBe(false);
  });
});

describe("isLegalTransition — every ordered pair is covered", () => {
  it("has exactly 6 legal and 10 illegal pairs across the 4 statuses", () => {
    const statuses: PlotStatus[] = ["available", "booked", "registered", "hold"];
    let legal = 0;
    let illegal = 0;
    for (const from of statuses) {
      for (const to of statuses) {
        if (isLegalTransition(from, to)) legal++;
        else illegal++;
      }
    }
    expect(legal).toBe(6);
    expect(illegal).toBe(10);
  });
});
