import { describe, expect, it } from "vitest";
import { buildPublicLinkPath, parsePublicToken } from "./publicLinkUrl.ts";

const TOKEN = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("buildPublicLinkPath", () => {
  it("builds the path parsePublicToken can parse back out (round-trip)", () => {
    const path = buildPublicLinkPath(TOKEN);
    expect(parsePublicToken(path, "")).toBe(TOKEN);
  });

  it("produces the exact /public/<token> shape", () => {
    expect(buildPublicLinkPath(TOKEN)).toBe(`/public/${TOKEN}`);
  });
});

describe("parsePublicToken", () => {
  it("extracts the token from a valid public path", () => {
    expect(parsePublicToken(`/public/${TOKEN}`, "")).toBe(TOKEN);
  });

  it("is case-insensitive on the uuid's hex digits", () => {
    const upper = TOKEN.toUpperCase();
    expect(parsePublicToken(`/public/${upper}`, "")).toBe(upper);
  });

  it("still extracts the token from the old hash form (links already sent out)", () => {
    expect(parsePublicToken("/", `#/public/${TOKEN}`)).toBe(TOKEN);
  });

  it("prefers the path over the hash when both are somehow present", () => {
    const other = "00000000-0000-0000-0000-000000000000";
    expect(parsePublicToken(`/public/${TOKEN}`, `#/public/${other}`)).toBe(TOKEN);
  });

  it("returns null for the app's normal root path and empty hash", () => {
    expect(parsePublicToken("/", "")).toBeNull();
  });

  it("returns null for a bare '#'", () => {
    expect(parsePublicToken("/", "#")).toBeNull();
  });

  it("returns null for a malformed token in either form", () => {
    expect(parsePublicToken("/public/not-a-uuid", "")).toBeNull();
    expect(parsePublicToken("/", "#/public/not-a-uuid")).toBeNull();
  });

  it("returns null for 36 hex/dash characters in the wrong uuid grouping", () => {
    // Same length as a real uuid but not one — this shape used to slip through and reach
    // get_public_colony() as a token, throwing 22P02 instead of resolving to found: false.
    expect(parsePublicToken("/public/00000000000000000000000000000000--", "")).toBeNull();
  });

  it("returns null for an unrelated path and hash", () => {
    expect(parsePublicToken("/something-else", "#/something-else")).toBeNull();
  });
});
