import type { AppState } from '../types';

const DB_NAME = 'ridgeline-autoshop';
const STORE_NAME = 'local-backups';
const DB_VERSION = 1;
const ANDROID_PREFIX = 'android:';
const INDEXEDDB_PREFIX = 'idb:';

export const MAX_LOCAL_BACKUPS = 10;
export const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

export interface LocalBackupSummary {
  id: string;
  savedAt: string;
  customers: number;
  vehicles: number;
  jobs: number;
  items: number;
  appointments: number;
}

export interface LocalBackup extends LocalBackupSummary {
  state: AppState;
}

interface StoredBackup {
  id?: number;
  savedAt: string;
  customers: number;
  vehicles: number;
  jobs: number;
  items: number;
  appointments: number;
  state: AppState;
}

interface AndroidAutoBackupsBridge {
  save: (content: string) => boolean;
  list: () => string;
  read: (id: string) => string | null;
}

declare global {
  interface Window {
    AndroidAutoBackups?: AndroidAutoBackupsBridge;
  }
}

let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local backups are not available in this browser.'));
  }
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('savedAt', 'savedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open local backup storage.'));
    }).catch((error: unknown) => {
      database = null;
      throw error;
    });
  }
  return database;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Local backup request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Local backup transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local backup transaction was aborted.'));
  });
}

function androidBridge(): AndroidAutoBackupsBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.AndroidAutoBackups;
}

function makeRecord(state: AppState): Omit<StoredBackup, 'id'> {
  return {
    savedAt: new Date().toISOString(),
    customers: state.customers.length,
    vehicles: state.vehicles.length,
    jobs: state.jobs.length,
    items: state.items.length,
    appointments: state.appointments.length,
    state,
  };
}

function summaryFrom(record: StoredBackup, id: string): LocalBackupSummary {
  return {
    id,
    savedAt: record.savedAt,
    customers: record.customers,
    vehicles: record.vehicles,
    jobs: record.jobs,
    items: record.items,
    appointments: record.appointments,
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nativeSummaries(raw: string): LocalBackupSummary[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const record = entry as Record<string, unknown>;
      const nativeId =
        typeof record.id === 'string'
          ? record.id
          : typeof record.id === 'number'
            ? String(record.id)
            : '';
      if (!nativeId) return [];
      return [
        {
          id: `${ANDROID_PREFIX}${nativeId}`,
          savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
          customers: numberOrZero(record.customers),
          vehicles: numberOrZero(record.vehicles),
          jobs: numberOrZero(record.jobs),
          items: numberOrZero(record.items),
          appointments: numberOrZero(record.appointments),
        },
      ];
    });
  } catch {
    return [];
  }
}

async function pruneIndexedDb(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const keys = await requestResult(store.getAllKeys());
  const excess = keys.length - MAX_LOCAL_BACKUPS;
  for (let index = 0; index < excess; index += 1) {
    store.delete(keys[index]);
  }
  await transactionDone(transaction);
}

async function saveIndexedDb(record: Omit<StoredBackup, 'id'>): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).add(record);
  await transactionDone(transaction);
  await pruneIndexedDb();
}

async function listIndexedDb(): Promise<LocalBackupSummary[]> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredBackup[]>;
  const records = await requestResult(request);
  return records.map((record) =>
    summaryFrom(record, `${INDEXEDDB_PREFIX}${record.id ?? 0}`),
  );
}

/** Stores a snapshot and removes the oldest ones once the limit is reached. */
export async function saveLocalBackup(state: AppState): Promise<void> {
  const record = makeRecord(state);
  const bridge = androidBridge();
  if (bridge) {
    try {
      if (bridge.save(JSON.stringify(record))) return;
    } catch {
      // Fall through to IndexedDB if the native bridge is unavailable.
    }
  }
  await saveIndexedDb(record);
}

export async function listLocalBackups(): Promise<LocalBackupSummary[]> {
  const native: LocalBackupSummary[] = [];
  const bridge = androidBridge();
  if (bridge) {
    try {
      native.push(...nativeSummaries(bridge.list()));
    } catch {
      // Keep IndexedDB results when the shared folder cannot be read.
    }
  }

  let indexed: LocalBackupSummary[] = [];
  try {
    indexed = await listIndexedDb();
  } catch (error) {
    if (native.length === 0) throw error;
  }

  // A failed native save can leave the same snapshot in both stores. Keep all
  // other snapshots, even when rapid saves share a millisecond timestamp.
  const nativeTimes = new Set(native.map((backup) => backup.savedAt));
  return [...native, ...indexed.filter((backup) => !nativeTimes.has(backup.savedAt))]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_LOCAL_BACKUPS);
}

export async function getLocalBackup(id: string): Promise<LocalBackup | null> {
  if (id.startsWith(ANDROID_PREFIX)) {
    const bridge = androidBridge();
    if (!bridge) return null;
    try {
      const text = bridge.read(id.slice(ANDROID_PREFIX.length));
      if (!text) return null;
      const record = JSON.parse(text) as StoredBackup;
      if (!record || !record.state) return null;
      return { ...summaryFrom(record, id), state: record.state };
    } catch {
      return null;
    }
  }

  if (!id.startsWith(INDEXEDDB_PREFIX)) return null;
  const numericId = Number(id.slice(INDEXEDDB_PREFIX.length));
  if (!Number.isInteger(numericId)) return null;

  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).get(numericId) as IDBRequest<
    StoredBackup | undefined
  >;
  const record = await requestResult(request);
  if (!record || record.id === undefined) return null;
  return { ...summaryFrom(record, id), state: record.state };
}

/** Creates a first snapshot only when no historical backups exist yet. */
export async function ensureLocalBackup(state: AppState): Promise<void> {
  const existing = await listLocalBackups();
  if (existing.length === 0) await saveLocalBackup(state);
}
