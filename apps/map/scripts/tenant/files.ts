import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Counts } from "./counts.ts";
import { TenantError } from "./errors.ts";

export interface TableFile {
  file: string;
  rows: number;
  sha256: string;
  columns: string[];
  // Columns holding at least one non-null value in the export: the import refuses to drop these.
  nonNullColumns: string[];
}

export interface StorageEntry {
  bucket: string;
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
}

export interface Manifest {
  version: 1;
  orgId: string;
  exportedAt: string;
  tables: Record<string, TableFile>;
  counts: Counts;
  // md5 per table of the exported content at snapshot time (see fingerprint.ts).
  fingerprints: Record<string, string>;
  storage: StorageEntry[];
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

// The export holds personal data and password hashes: owner-only permissions where the OS honours them.
export function writePrivate(file: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, data, { mode: 0o600 });
}

export function readLines(file: string): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

export function loadManifest(dir: string): Manifest {
  const file = path.join(dir, "manifest.json");
  if (!fs.existsSync(file)) throw new TenantError(`no manifest.json in ${dir}`);
  const m = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  if (m.version !== 1 || !m.orgId || !m.tables || !m.counts) {
    throw new TenantError("manifest.json is not a version-1 tenant export");
  }
  return m;
}

// Every table file and storage file must match its recorded hash before anything is written.
export function verifyHashes(dir: string, m: Manifest): void {
  for (const [key, t] of Object.entries(m.tables)) {
    const file = path.join(dir, t.file);
    if (!fs.existsSync(file)) throw new TenantError(`${key}: ${t.file} is missing`);
    if (sha256Hex(fs.readFileSync(file)) !== t.sha256) {
      throw new TenantError(`${key}: ${t.file} does not match its recorded sha256`);
    }
  }
  for (const s of m.storage) {
    const file = path.join(dir, "storage", s.bucket, s.path);
    if (!fs.existsSync(file)) throw new TenantError(`storage ${s.bucket}/${s.path} is missing`);
    if (sha256Hex(fs.readFileSync(file)) !== s.sha256) {
      throw new TenantError(`storage ${s.bucket}/${s.path} does not match its recorded sha256`);
    }
  }
}

function isInsideGitWorkTree(dir: string): boolean {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.toString().trim() === "true";
  } catch {
    return false;
  }
}

// The output directory must be new (or empty) and must not be inside any git work tree: an export
// carries owner names, phone numbers and password hashes and must never be committable by accident.
export function assertOutDirSafe(outDir: string): string {
  const abs = path.resolve(outDir);
  if (fs.existsSync(abs) && fs.readdirSync(abs).length > 0) {
    throw new TenantError("--out already exists and is not empty");
  }
  let probe = abs;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  if (isInsideGitWorkTree(probe)) {
    throw new TenantError("--out is inside a git work tree; choose a folder outside the repository");
  }
  return abs;
}
