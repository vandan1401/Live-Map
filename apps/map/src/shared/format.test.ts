import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatRelativeTime,
  formatRupees,
  formatStatusLabel,
} from "./format.ts";

describe("formatRupees", () => {
  it("formats whole rupees with no decimal", () => {
    expect(formatRupees(150000000)).toBe("₹15,00,000");
  });

  it("formats a paise remainder without floating-point artifacts", () => {
    expect(formatRupees(150050)).toBe("₹1,500.50");
  });

  it("never shows a float epsilon", () => {
    // 0.1 + 0.2 territory — every value here is an integer paise count (D-010).
    expect(formatRupees(30)).toBe("₹0.30");
  });

  it("renders a placeholder for a null or missing value", () => {
    expect(formatRupees(null)).toBe("—");
    expect(formatRupees(undefined)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as day month year", () => {
    expect(formatDate("2026-03-05")).toBe("5 Mar 2026");
  });

  it("renders a placeholder for a null or missing value", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-12T14:40:00+05:30");

  it("shows time only for today", () => {
    expect(formatRelativeTime("2026-08-12T14:40:00+05:30", now)).toBe(
      "2:40 pm today",
    );
  });

  it("shows 'yesterday' for the day before", () => {
    expect(formatRelativeTime("2026-08-11T09:05:00+05:30", now)).toBe(
      "9:05 am yesterday",
    );
  });

  it("shows a full date further back", () => {
    expect(formatRelativeTime("2026-08-01T09:05:00+05:30", now)).toBe(
      "1 Aug, 9:05 am",
    );
  });
});

describe("formatStatusLabel", () => {
  it("capitalises available and booked", () => {
    expect(formatStatusLabel("available")).toBe("Available");
    expect(formatStatusLabel("booked")).toBe("Booked");
  });

  it("renders registered as 'Registry done'", () => {
    expect(formatStatusLabel("registered")).toBe("Registry done");
  });
});
