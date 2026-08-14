import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ColonyMap } from "./ColonyMap";

afterEach(() => {
  cleanup();
});

describe("ColonyMap", () => {
  it("renders all 26 plots from the shared fixture", () => {
    const { container } = render(
      <ColonyMap actor="test-actor" colonyId="shree-vatika-2" onBack={vi.fn()} />,
    );
    expect(container.querySelectorAll(".plot")).toHaveLength(26);
  });

  it("logs a plot's id when clicked", () => {
    const { container } = render(
      <ColonyMap actor="test-actor" colonyId="shree-vatika-2" onBack={vi.fn()} />,
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const plot = container.querySelector(".plot") as SVGPathElement;
    plot.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(logSpy).toHaveBeenCalledWith(plot.id);
    logSpy.mockRestore();
  });

  it("shows the not-to-scale note", () => {
    const { getByText } = render(
      <ColonyMap actor="test-actor" colonyId="shree-vatika-2" onBack={vi.fn()} />,
    );
    expect(getByText("Indicative layout — not to scale")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <ColonyMap actor="test-actor" colonyId="shree-vatika-2" onBack={onBack} />,
    );
    getByText("← Colonies").click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
