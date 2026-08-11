import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ColonyMap } from "./ColonyMap";

afterEach(() => {
  cleanup();
});

describe("ColonyMap", () => {
  it("renders all 45 plots from the shared fixture", () => {
    const { container } = render(<ColonyMap />);
    expect(container.querySelectorAll(".plot")).toHaveLength(45);
  });

  it("logs a plot's id when clicked", () => {
    const { container } = render(<ColonyMap />);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const plot = container.querySelector(".plot") as SVGPathElement;
    plot.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(logSpy).toHaveBeenCalledWith(plot.id);
    logSpy.mockRestore();
  });

  it("shows the not-to-scale note", () => {
    const { getByText } = render(<ColonyMap />);
    expect(getByText("Indicative layout — not to scale")).toBeInTheDocument();
  });
});
