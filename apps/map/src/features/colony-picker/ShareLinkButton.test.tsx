import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareLinkButton } from "./ShareLinkButton.tsx";

afterEach(() => {
  cleanup();
});

describe("ShareLinkButton", () => {
  it("shows 'No public link yet' when the colony has no token, with no button", () => {
    render(<ShareLinkButton token={null} />);
    expect(screen.getByText("No public link yet")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  describe("with a token", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      writeText.mockClear();
      // jsdom has no navigator.clipboard implementation at all — stub only what this
      // button calls, scoped to this describe block, not the global test setup.
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
    });

    it("copies the full shareable URL (origin + pathname + hash), not just the token", async () => {
      render(<ShareLinkButton token="3fa85f64-5717-4562-b3fc-2c963f66afa6" />);

      fireEvent.click(screen.getByText("Copy share link"));

      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}${window.location.pathname}#/public/3fa85f64-5717-4562-b3fc-2c963f66afa6`,
      );
    });

    it("shows 'Copied!' after a successful copy, then reverts", async () => {
      // testing-library's waitFor polls on real timers, which deadlocks against
      // vi.useFakeTimers() — advance explicitly instead, starting with 0ms to flush the
      // writeText() promise microtask (and the setCopied/setTimeout it triggers) without
      // yet firing the 2s revert timer itself.
      vi.useFakeTimers();
      try {
        render(<ShareLinkButton token="3fa85f64-5717-4562-b3fc-2c963f66afa6" />);

        fireEvent.click(screen.getByText("Copy share link"));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Copied!")).toBeTruthy();

        await act(() => vi.advanceTimersByTimeAsync(2000)); // matches COPIED_LABEL_MS
        expect(screen.getByText("Copy share link")).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
