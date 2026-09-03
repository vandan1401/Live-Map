import { describe, expect, it } from "vitest";
import {
  formatActorName,
  formatDate,
  formatPlotLabel,
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
  it("uses a supplied labels override in place of the default text (docs/plans/27.md)", () => {
    expect(formatStatusLabel("available", { available: "खाली" })).toBe("खाली");
    // A status absent from the override still falls back to the default logic.
    expect(formatStatusLabel("registered", { available: "खाली" })).toBe("Registry done");
  });

  it("capitalises available and booked", () => {
    expect(formatStatusLabel("available")).toBe("Available");
    expect(formatStatusLabel("booked")).toBe("Booked");
  });

  it("renders registered as 'Registry done'", () => {
    expect(formatStatusLabel("registered")).toBe("Registry done");
  });
});

describe("formatPlotLabel", () => {
  it("joins block and number for a lettered plot", () => {
    expect(formatPlotLabel({ block: "A", number: "01" })).toBe("A-01");
  });

  it("shows just the number for a blockless plot", () => {
    expect(formatPlotLabel({ block: "", number: "07" })).toBe("07");
  });
});

describe("formatActorName", () => {
  it("renders the import sentinel as 'Imported'", () => {
    expect(formatActorName("import")).toBe("Imported");
  });

  it("renders the bulk_import sentinel as 'Bulk import' (docs/plans/10.md)", () => {
    expect(formatActorName("bulk_import")).toBe("Bulk import");
  });

  it("passes through a real display name unchanged", () => {
    expect(formatActorName("Rajesh Shah")).toBe("Rajesh Shah");
  });
});
