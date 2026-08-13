import { describe, expect, it } from "vitest";
import { formatFreshnessLabel } from "./freshness.ts";

const BASE = new Date("2026-08-15T12:00:00.000Z");
const at = (seconds: number) => new Date(BASE.getTime() + seconds * 1000);

describe("formatFreshnessLabel", () => {
  it("under 60s, online, reads 'just now'", () => {
    expect(formatFreshnessLabel(BASE, at(30), true)).toBe("Updated just now");
  });

  it("under 60s, offline, reads 'just now' with the offline prefix", () => {
    expect(formatFreshnessLabel(BASE, at(0), false)).toBe("Offline — last synced just now");
  });

  it("minutes, online", () => {
    expect(formatFreshnessLabel(BASE, at(120), true)).toBe("Updated 2 min ago");
  });

  it("floors partial minutes rather than rounding", () => {
    expect(formatFreshnessLabel(BASE, at(179), true)).toBe("Updated 2 min ago");
  });

  it("hour boundary switches to the 'h' abbreviation", () => {
    expect(formatFreshnessLabel(BASE, at(3600), true)).toBe("Updated 1h ago");
  });

  it("reproduces spec/05's literal offline example", () => {
    expect(formatFreshnessLabel(BASE, at(3 * 3600), false)).toBe(
      "Offline — last synced 3h ago",
    );
  });

  it("clamps a negative elapsed time (clock skew) to 'just now' rather than a negative duration", () => {
    expect(formatFreshnessLabel(BASE, at(-5), true)).toBe("Updated just now");
  });
});
