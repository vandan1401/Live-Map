import { describe, expect, it } from "vitest";
import { StatusTransitions, STATUS_TRANSITION_MS } from "./statusTransitions.ts";

describe("StatusTransitions", () => {
  it("runs a single change over the pinned 400ms and then settles", () => {
    // spec/05's "feels multiplayer" moment, previously free via CSS.
    const t = new StatusTransitions();
    t.start("plot-A-01", 1000);
    expect(t.progress(1000).get("plot-A-01")).toBe(0);
    expect(t.progress(1000 + STATUS_TRANSITION_MS / 2).get("plot-A-01")).toBeGreaterThan(0);
    expect(t.active).toBe(true);
    expect(t.progress(1000 + STATUS_TRANSITION_MS).has("plot-A-01")).toBe(false);
    expect(t.active).toBe(false);
  });

  it("animates nothing when nothing was started", () => {
    // The bulk-load path registers no transitions, so 675 plots arriving at once do not
    // become 675 simultaneous fades — the reason .no-transition existed.
    const t = new StatusTransitions();
    expect(t.progress(0).size).toBe(0);
    expect(t.active).toBe(false);
  });
});
