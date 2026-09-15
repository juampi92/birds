import { browser } from '$app/environment';
import { modes, type Mode } from '$lib/data';
import type { Attempt, Progress } from '$lib/engine';

const DB_NAME = 'birds-practice';
const DB_VERSION = 3;
const STORE_NAME = 'snapshot';
const SNAPSHOT_KEY = 'current';

export type PersistedSnapshot = {
  schemaVersion: 3;
  progress: Record<string, Progress>;
  attempts: Attempt[];
  preferences: { modes: Mode[] };
};

type LegacySnapshot = {
  progress?: unknown;
  attempts?: unknown;
  preferences?: { modes?: unknown };
};

const initialSnapshot = (): PersistedSnapshot => ({
  schemaVersion: DB_VERSION,
  progress: {},
  attempts: [],
  preferences: { modes: [...modes] }
});

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isSupportedMode(value: unknown): value is Mode {
  return typeof value === 'string' && modes.includes(value as Mode);
}

function normalizeProgress(value: unknown): Record<string, Progress> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => isSupportedMode(key.slice(key.lastIndexOf(':') + 1)))
  );
}

function normalizeAttempts(value: unknown): Attempt[] {
  if (!Array.isArray(value)) return [];
  return value.filter((attempt): attempt is Attempt => {
    if (!attempt || typeof attempt !== 'object') return false;
    return isSupportedMode((attempt as { mode?: unknown }).mode);
  });
}

export function normalizeSnapshot(value: unknown): PersistedSnapshot {
  const saved = (value ?? {}) as LegacySnapshot;
  const selectedModes = Array.isArray(saved.preferences?.modes)
    ? saved.preferences.modes.filter(isSupportedMode)
    : [];
  return {
    schemaVersion: DB_VERSION,
    progress: normalizeProgress(saved.progress),
    attempts: normalizeAttempts(saved.attempts),
    preferences: { modes: selectedModes.length ? selectedModes : [...modes] }
  };
}

export async function loadSnapshot(): Promise<PersistedSnapshot> {
  if (!browser) return initialSnapshot();
  const db = await openDb();
  const saved = await new Promise<unknown>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return normalizeSnapshot(saved);
}

export async function saveSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  if (!browser) return;
  // Svelte 5 state values can be reactive proxies. IndexedDB's structured
  // clone cannot persist those proxies, so cross the persistence boundary
  // with a plain JSON-compatible snapshot.
  const plainSnapshot = JSON.parse(JSON.stringify(snapshot)) as PersistedSnapshot;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(plainSnapshot, SNAPSHOT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
