import { describe, expect, it } from "vitest";
import { InvalidUsernameError, usernameToEmail } from "./username.ts";

describe("usernameToEmail", () => {
  it("lowercases and appends the synthetic domain", () => {
    expect(usernameToEmail("Vandan")).toBe("vandan@colony.local");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(usernameToEmail("  vandan  ")).toBe("vandan@colony.local");
  });

  it("allows hyphens, underscores, and digits", () => {
    expect(usernameToEmail("vandan-moonat_2")).toBe("vandan-moonat_2@colony.local");
  });

  it("rejects a username shorter than 2 characters", () => {
    expect(() => usernameToEmail("v")).toThrow(InvalidUsernameError);
  });

  it("rejects a username longer than 32 characters", () => {
    expect(() => usernameToEmail("a".repeat(33))).toThrow(InvalidUsernameError);
  });

  it("rejects a username containing an email-like character", () => {
    expect(() => usernameToEmail("vandan@example.com")).toThrow(InvalidUsernameError);
  });

  it("rejects a username containing a space", () => {
    expect(() => usernameToEmail("vandan moonat")).toThrow(InvalidUsernameError);
  });

  it("rejects an empty username", () => {
    expect(() => usernameToEmail("")).toThrow(InvalidUsernameError);
  });
});
