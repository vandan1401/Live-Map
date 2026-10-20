import fs from "node:fs";
import path from "node:path";
import { createDbClient } from "../../src/lib/db/client.ts";
import { TenantError } from "./errors.ts";
import { sha256Hex, writePrivate, type StorageEntry } from "./files.ts";
import type { TenantEnv } from "./connect.ts";

// Storage objects are copied through the Storage API with the service-role key and the same object
// path; never by inserting into storage.objects (docs/plans/38.md §3). The only bucket with tenant
// objects is colony-backdrops (D-047/D-048): the SVG is a column on `colonies`, not an object.

function storageClient(env: TenantEnv) {
  return createDbClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface ObjectToCopy {
  bucket: string;
  path: string;
  contentType: string;
  bytes: number;
}

export async function downloadObjects(
  env: TenantEnv,
  objects: readonly ObjectToCopy[],
  outDir: string,
): Promise<StorageEntry[]> {
  const client = storageClient(env);
  const entries: StorageEntry[] = [];
  for (const o of objects) {
    const { data, error } = await client.storage.from(o.bucket).download(o.path);
    if (error || !data) throw new TenantError(`could not download ${o.bucket}/${o.path}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length !== o.bytes) {
      throw new TenantError(
        `${o.bucket}/${o.path}: downloaded ${bytes.length} bytes, storage.objects says ${o.bytes}`,
      );
    }
    writePrivate(path.join(outDir, "storage", o.bucket, o.path), bytes);
    entries.push({
      bucket: o.bucket,
      path: o.path,
      bytes: bytes.length,
      sha256: sha256Hex(bytes),
      contentType: o.contentType,
    });
  }
  return entries;
}

// Uploads without overwrite, then downloads each object back and compares its sha256. Returns the
// paths it created so the caller can remove them again if the database side rolls back.
export async function uploadAndVerify(
  env: TenantEnv,
  entries: readonly StorageEntry[],
  inDir: string,
  created: StorageEntry[],
): Promise<void> {
  const client = storageClient(env);
  for (const e of entries) {
    const body = fs.readFileSync(path.join(inDir, "storage", e.bucket, e.path));
    const up = await client.storage
      .from(e.bucket)
      .upload(e.path, body, { contentType: e.contentType, upsert: false });
    if (up.error) throw new TenantError(`could not upload ${e.bucket}/${e.path} (already there?)`);
    created.push(e);
    const down = await client.storage.from(e.bucket).download(e.path);
    if (down.error || !down.data) throw new TenantError(`could not read back ${e.bucket}/${e.path}`);
    const back = Buffer.from(await down.data.arrayBuffer());
    if (sha256Hex(back) !== e.sha256) {
      throw new TenantError(`${e.bucket}/${e.path} read back with a different sha256`);
    }
  }
}

// Best effort after a failed import: take away what this run uploaded, nothing else. Returns the
// objects it could NOT remove so the caller can say so instead of leaving them silently.
export async function removeUploaded(env: TenantEnv, created: readonly StorageEntry[]): Promise<string[]> {
  const client = storageClient(env);
  const left: string[] = [];
  for (const e of created) {
    const { error } = await client.storage.from(e.bucket).remove([e.path]);
    if (error) left.push(`${e.bucket}/${e.path}`);
  }
  return left;
}
