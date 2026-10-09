// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/plans/36.md: the service-role key may be named only by Node-side code (admin-portal/,
// scripts/) and test infrastructure. Nothing that ships in the browser bundle (src/ app code,
// public/) may reference it. The built-bundle grep in the plan's acceptance criteria is the
// final proof; this catches a regression before a build.
const root = path.resolve(import.meta.dirname, "..");
const TEST_INFRA = [/\.test\.tsx?$/, /[\\/]src[\\/]test[\\/]/, /[\\/]testHelpers\.ts$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("service-role key isolation", () => {
  it("is not referenced by any shipped source or public asset", () => {
    const files = [...walk(path.join(root, "src")), ...walk(path.join(root, "public"))].filter(
      (file) => !TEST_INFRA.some((pattern) => pattern.test(file)),
    );
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((file) => /service_role/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
