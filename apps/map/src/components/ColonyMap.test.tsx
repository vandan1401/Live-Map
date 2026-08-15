import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ColonyMap } from "./ColonyMap";

afterEach(() => {
  cleanup();
});

// A generic "any chained call resolves to no data" stub — these tests assert on the
// static SVG/DOM, not on live sync data, so a real client (and Docker) isn't needed.
// docs/plans/09.md: client is now a required prop (created once in App.tsx), not created
// internally, so every render call site needs one.
function createFakeSupabaseClient(): SupabaseClient {
  const chain: unknown = new Proxy(function chain() {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return chain;
    },
    apply() {
      return chain;
    },
  });
  return {
    from: () => chain,
    channel: () => chain,
    removeChannel: () => {},
    auth: { signOut: () => Promise.resolve({ error: null }) },
  } as unknown as SupabaseClient;
}

describe("ColonyMap", () => {
  it("renders all 26 plots from the shared fixture", () => {
    const { container } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        onBack={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".plot")).toHaveLength(26);
  });

  it("logs a plot's id when clicked", () => {
    const { container } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        onBack={vi.fn()}
      />,
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const plot = container.querySelector(".plot") as SVGPathElement;
    plot.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(logSpy).toHaveBeenCalledWith(plot.id);
    logSpy.mockRestore();
  });

  it("shows the not-to-scale note", () => {
    const { getByText } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        onBack={vi.fn()}
      />,
    );
    expect(getByText("Indicative layout — not to scale")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <ColonyMap
        client={createFakeSupabaseClient()}
        actor="test-actor"
        colonyId="shree-vatika-2"
        onBack={onBack}
      />,
    );
    getByText("← Colonies").click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
