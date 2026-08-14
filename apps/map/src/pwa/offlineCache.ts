import type { ColonyRow, PlotStatus } from "../lib/db/types.ts";

// PWA-specific persistence, not a domain read (docs/plans/07.md §3) — kept out of
// lib/colony/ on purpose. Native indexedDB only, no wrapper dependency.
const DB_NAME = "colony-map-offline";
const DB_VERSION = 1;
const STATUS_STORE = "plot-snapshots";
const COLONY_LIST_KEY = "__colonies__";

export interface StatusSnapshot {
  statuses: Record<string, PlotStatus>;
  savedAt: string;
}

export interface ColonyListSnapshot {
  colonies: ColonyRow[];
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STATUS_STORE)) {
        request.result.createObjectStore(STATUS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATUS_STORE, "readwrite");
    tx.objectStore(STATUS_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STATUS_STORE, "readonly");
    const request = tx.objectStore(STATUS_STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function saveSnapshot(
  colonyId: string,
  statuses: Record<string, PlotStatus>,
): Promise<void> {
  const snapshot: StatusSnapshot = { statuses, savedAt: new Date().toISOString() };
  await put(colonyId, snapshot);
}

export async function loadSnapshot(colonyId: string): Promise<StatusSnapshot | null> {
  return get<StatusSnapshot>(colonyId);
}

export async function saveColonyList(colonies: ColonyRow[]): Promise<void> {
  const snapshot: ColonyListSnapshot = { colonies, savedAt: new Date().toISOString() };
  await put(COLONY_LIST_KEY, snapshot);
}

export async function loadColonyList(): Promise<ColonyListSnapshot | null> {
  return get<ColonyListSnapshot>(COLONY_LIST_KEY);
}
