import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ColonyPicker } from "./ColonyPicker.tsx";
import type { ColonyRow } from "../../lib/db/types.ts";

afterEach(() => cleanup());

const colony = { id: "c1", name: "Colony One", verified: true } as ColonyRow;

function picker(colonies: ColonyRow[], onChangePassword?: () => void) {
  render(
    <ColonyPicker
      colonies={colonies}
      orgName={null}
      onSelect={vi.fn()}
      onUpload={vi.fn()}
      onLogout={vi.fn()}
      onChangePassword={onChangePassword}
    />,
  );
}

describe("ColonyPicker: Change password button (docs/plans/39.md)", () => {
  it.each([
    ["with colonies", [colony]],
    ["with none (empty state)", [] as ColonyRow[]],
  ])("renders and fires the callback %s", (_label, colonies) => {
    const onChangePassword = vi.fn();
    picker(colonies, onChangePassword);
    fireEvent.click(screen.getByText("Change password"));
    expect(onChangePassword).toHaveBeenCalledTimes(1);
  });

  it("shows no button when the caller supplies no handler", () => {
    picker([colony]);
    expect(screen.queryByText("Change password")).toBeNull();
    expect(screen.getByText("Log out")).toBeTruthy();
  });
});
