import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertOutDirSafe, sha256Hex, verifyHashes, writePrivate, type Manifest } from "./files.ts";

const made: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-test-"));
  made.push(d);
  return d;
}
afterEach(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function manifestFor(dir: string, body: string): Manifest {
  writePrivate(path.join(dir, "public.plots.ndjson"), body);
  return {
    version: 1,
    orgId: "o",
    exportedAt: "now",
    tables: {
      "public.plots": {
        file: "public.plots.ndjson",
        rows: 1,
        sha256: sha256Hex(body),
        columns: ["id"],
        nonNullColumns: ["id"],
      },
    },
    counts: { tables: {}, perColony: {} },
    fingerprints: {},
    storage: [],
  };
}

describe("verifyHashes", () => {
  it("passes untouched files", () => {
    const dir = tmp();
    expect(() => verifyHashes(dir, manifestFor(dir, '{"id":"a"}\n'))).not.toThrow();
  });
  it("refuses a file with one byte changed", () => {
    const dir = tmp();
    const m = manifestFor(dir, '{"id":"a"}\n');
    fs.writeFileSync(path.join(dir, "public.plots.ndjson"), '{"id":"b"}\n');
    expect(() => verifyHashes(dir, m)).toThrow(/sha256/);
  });
  it("refuses a missing file", () => {
    const dir = tmp();
    const m = manifestFor(dir, "x\n");
    fs.rmSync(path.join(dir, "public.plots.ndjson"));
    expect(() => verifyHashes(dir, m)).toThrow(/missing/);
  });
});

describe("assertOutDirSafe", () => {
  it("accepts a new folder outside any git work tree", () => {
    const base = tmp();
    expect(assertOutDirSafe(path.join(base, "export"))).toBe(path.join(base, "export"));
  });
  it("refuses a folder inside this repository's work tree", () => {
    expect(() => assertOutDirSafe(path.join(process.cwd(), "tenant-export-test"))).toThrow(/git work tree/);
  });
  it("refuses a folder that already has files in it", () => {
    const base = tmp();
    fs.writeFileSync(path.join(base, "x"), "1");
    expect(() => assertOutDirSafe(base)).toThrow(/not empty/);
  });
});
