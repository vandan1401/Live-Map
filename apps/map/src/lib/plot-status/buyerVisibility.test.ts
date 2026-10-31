import { describe, expect, it } from "vitest";
import { statusShowsBuyer } from "./buyerVisibility.ts";

// docs/plans/41.md, D-054.
describe("statusShowsBuyer", () => {
  it("shows the buyer on booked, registered and any custom status", () => {
    for (const status of ["booked", "registered", "sold_to_investors", "on_hold"]) {
      expect(statusShowsBuyer(status)).toBe(true);
    }
  });

  it("hides the sticky owner_name only on available (D-018)", () => {
    expect(statusShowsBuyer("available")).toBe(false);
  });

  // Accepted cost, pinned so a change is deliberate: owner_name is never cleared, so a plot booked
  // for X, un-booked to available, then moved to a custom status shows X again. The status alone
  // cannot tell a "real" buyer from a stale one; closing that needs history or a database change.
  it("cannot tell a stale owner_name from a current one by status alone", () => {
    expect(statusShowsBuyer("sold_to_investors")).toBe(true);
  });
});
