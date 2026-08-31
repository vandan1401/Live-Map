import { describe, expect, it } from "vitest";
import { buildPublicLinkHash, parsePublicToken } from "./publicLinkUrl.ts";

const TOKEN = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("buildPublicLinkHash", () => {
  it("builds the hash parsePublicToken can parse back out (round-trip)", () => {
    const hash = buildPublicLinkHash(TOKEN);
    expect(parsePublicToken(hash)).toBe(TOKEN);
  });

  it("produces the exact #/public/<token> shape", () => {
    expect(buildPublicLinkHash(TOKEN)).toBe(`#/public/${TOKEN}`);
  });
});

describe("parsePublicToken", () => {
  it("extracts the token from a valid public hash", () => {
    expect(parsePublicToken(`#/public/${TOKEN}`)).toBe(TOKEN);
  });

  it("is case-insensitive on the uuid's hex digits", () => {
    const upper = TOKEN.toUpperCase();
    expect(parsePublicToken(`#/public/${upper}`)).toBe(upper);
  });

  it("returns null for the app's normal empty hash", () => {
    expect(parsePublicToken("")).toBeNull();
  });

  it("returns null for a bare '#'", () => {
    expect(parsePublicToken("#")).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(parsePublicToken("#/public/not-a-uuid")).toBeNull();
  });

  it("returns null for 36 hex/dash characters in the wrong uuid grouping", () => {
    // Same length as a real uuid but not one — this shape used to slip through and reach
    // get_public_colony() as a token, throwing 22P02 instead of resolving to found: false.
    expect(parsePublicToken("#/public/00000000000000000000000000000000--")).toBeNull();
  });

  it("returns null for an unrelated hash", () => {
    expect(parsePublicToken("#/something-else")).toBeNull();
  });
});
