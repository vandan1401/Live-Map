import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstallInstructions } from "./InstallInstructions.tsx";
import { hasSeenInstallInstructions } from "../../pwa/installInstructionsSeen.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("InstallInstructions", () => {
  it("renders the iOS steps", () => {
    render(<InstallInstructions onDismiss={vi.fn()} />);
    expect(screen.getByText("Add Colony Map to your home screen")).toBeTruthy();
  });

  it("dismiss persists the seen flag and calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<InstallInstructions onDismiss={onDismiss} />);

    expect(hasSeenInstallInstructions()).toBe(false);
    fireEvent.click(screen.getByText("Got it"));

    expect(onDismiss).toHaveBeenCalled();
    expect(hasSeenInstallInstructions()).toBe(true);
  });
});
