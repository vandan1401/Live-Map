import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChangePasswordDialog } from "./ChangePasswordDialog.tsx";

afterEach(() => cleanup());

function clients(over: { verifyError?: object; updateError?: object; othersError?: object } = {}) {
  const verify = {
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: over.verifyError ?? null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  } as unknown as SupabaseClient;
  const live = {
    auth: {
      updateUser: vi.fn(async () => ({ error: over.updateError ?? null })),
      signOut: vi.fn(async () => ({ error: over.othersError ?? null })),
    },
  } as unknown as SupabaseClient;
  return { verify, live };
}

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByPlaceholderText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByPlaceholderText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByPlaceholderText("Confirm new password"), { target: { value: confirm } });
}

function mount(c: ReturnType<typeof clients>, onClose = vi.fn()) {
  render(<ChangePasswordDialog client={c.live} email="a@colony.local" onClose={onClose} createVerifyClient={() => c.verify} />);
  return onClose;
}

describe("ChangePasswordDialog", () => {
  it("keeps Submit disabled until all three fields are filled", () => {
    mount(clients());
    const submit = screen.getByRole("button", { name: "Change password" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fill("old-password", "new-password-1", "new-password-1");
    expect(submit.disabled).toBe(false);
  });

  it("uses password inputs with the right autocomplete hints", () => {
    mount(clients());
    const current = screen.getByPlaceholderText("Current password") as HTMLInputElement;
    const next = screen.getByPlaceholderText("New password") as HTMLInputElement;
    expect([current.type, next.type]).toEqual(["password", "password"]);
    expect([current.autocomplete, next.autocomplete]).toEqual(["current-password", "new-password"]);
  });

  it("shows the success copy, only claiming other devices were signed out when they were", async () => {
    const c = clients();
    mount(c);
    fill("old-password", "new-password-1", "new-password-1");
    fireEvent.submit(screen.getByRole("button", { name: "Change password" }).closest("form")!);
    expect(await screen.findByText("Your password was changed.")).toBeTruthy();
    expect(screen.getByText("Your other devices will be signed out within the hour.")).toBeTruthy();
    expect(c.live.auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
  });

  it("does not claim other devices were signed out when that step failed", async () => {
    mount(clients({ othersError: { status: 500 } }));
    fill("old-password", "new-password-1", "new-password-1");
    fireEvent.submit(screen.getByRole("button", { name: "Change password" }).closest("form")!);
    expect(await screen.findByText("Your password was changed.")).toBeTruthy();
    expect(screen.queryByText(/other devices will be signed out/)).toBeNull();
  });

  it("shows a fixed failure message and clears every field after a refusal", async () => {
    const c = clients({ verifyError: { code: "invalid_credentials", status: 400 } });
    mount(c);
    fill("wrong-password", "new-password-1", "new-password-1");
    fireEvent.submit(screen.getByRole("button", { name: "Change password" }).closest("form")!);
    expect(await screen.findByText("Current password is incorrect.")).toBeTruthy();
    await waitFor(() => {
      expect((screen.getByPlaceholderText("Current password") as HTMLInputElement).value).toBe("");
      expect((screen.getByPlaceholderText("New password") as HTMLInputElement).value).toBe("");
      expect((screen.getByPlaceholderText("Confirm new password") as HTMLInputElement).value).toBe("");
    });
    expect(c.live.auth.updateUser).not.toHaveBeenCalled();
  });

  it("Cancel and Close both call onClose", async () => {
    const onClose = mount(clients());
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    const again = mount(clients());
    fill("old-password", "new-password-1", "new-password-1");
    fireEvent.submit(screen.getByRole("button", { name: "Change password" }).closest("form")!);
    fireEvent.click(await screen.findByText("Close"));
    expect(again).toHaveBeenCalledTimes(1);
  });
});
