import { describe, expect, it } from "vitest";
import { formatShareSummary, type ShareSummaryData } from "./shareSummary.ts";

const now = new Date("2026-08-14T12:00:00+05:30");

describe("formatShareSummary", () => {
  it("renders counts and recent changes in WhatsApp-legible plain text", () => {
    const data: ShareSummaryData = {
      colonyName: "Shree Vatika Phase 2",
      counts: { available: 30, booked: 10, registered: 5 },
      statusKeys: ["available", "booked", "registered"],
      recentChanges: [
        {
          label: "A-01",
          status: "booked",
          changedBy: "Vikas",
          changedAt: new Date("2026-08-14T11:55:00+05:30").toISOString(),
        },
      ],
    };

    const text = formatShareSummary(data, now);

    expect(text).toContain("Shree Vatika Phase 2 — plot status");
    expect(text).toContain("Available: 30");
    expect(text).toContain("Booked: 10");
    expect(text).toContain("Registry done: 5");
    expect(text).toContain("Recent changes:");
    expect(text).toContain("A-01 — Booked by Vikas,");
  });

  it("omits the recent-changes section entirely when there are none", () => {
    const data: ShareSummaryData = {
      colonyName: "Shree Vatika Phase 2",
      counts: { available: 45, booked: 0, registered: 0 },
      statusKeys: ["available", "booked", "registered"],
      recentChanges: [],
    };

    expect(formatShareSummary(data, now)).not.toContain("Recent changes");
  });
});

describe("formatShareSummary — a colony's own statuses (docs/plans/40.md)", () => {
  it("lists them in the colony's order with its labels, including a status no plot holds yet", () => {
    const data: ShareSummaryData = {
      colonyName: "Colony 1599",
      counts: { available: 12, sold_to_investors: 3, booked: 0 },
      statusKeys: ["available", "sold_to_investors", "booked"],
      recentChanges: [],
    };
    const text = formatShareSummary(data, now, { sold_to_investors: "Sold to investors" });
    expect(text.split("\n").slice(2)).toEqual(["Available: 12", "Sold to investors: 3", "Booked: 0"]);
  });
});
