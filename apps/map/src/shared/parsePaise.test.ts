import { describe, expect, it } from "vitest";
import { parseNullablePaise } from "./parsePaise.ts";

describe("parseNullablePaise", () => {
  it("treats a blank string as null", () => {
    expect(parseNullablePaise("")).toEqual({ ok: true, value: null });
    expect(parseNullablePaise("   ")).toEqual({ ok: true, value: null });
  });

  it("parses a plain integer string", () => {
    expect(parseNullablePaise("150000")).toEqual({ ok: true, value: 150000 });
  });

  it("trims surrounding whitespace", () => {
    expect(parseNullablePaise(" 250 ")).toEqual({ ok: true, value: 250 });
  });

  it("rejects a non-numeric string", () => {
    const result = parseNullablePaise("abc");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("abc");
  });
});
