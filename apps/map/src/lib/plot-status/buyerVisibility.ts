import type { PlotStatus } from "../db/types.ts";

// Whether a plot in `status` shows its buyer (owner_name).
// owner_name is sticky in the database (D-018) — never cleared, so it outlives an un-book. The only
// status where a stored name would read as "still sold to that person" is `available`, so that is the
// only one that hides it; booked, registered and every custom status (e.g. sold_to_investors) show it
// (docs/plans/41.md, D-054).
export function statusShowsBuyer(status: PlotStatus): boolean {
  return status !== "available";
}
