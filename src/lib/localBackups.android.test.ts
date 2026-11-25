import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import {
  getExternalBackupStatus,
  getLocalBackup,
  listLocalBackups,
  recoverLatestLocalBackup,
  saveLocalBackup,
} from './localBackups';

function emptyState(shopName: string): AppState {
  return {
    customers: [],
    vehicles: [],
    items: [],
    jobs: [],
    appointments: [],
    settings: { shopName, currency: 'PHP' },
    nextJobNumber: 1001,
    taxRate: 0.1,
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('local backups on Android', () => {
  it('saves, lists and reads through the shared-storage bridge', async () => {
    const records = new Map<string, string>();
    const bridge = {
      save(content: string) {
        records.set('42', content);
        return true;
      },
      list() {
        return JSON.stringify(
          Array.from(records.entries()).map(([id, content]) => {
            const record = JSON.parse(content) as Record<string, unknown>;
            return {
              id,
              savedAt: record.savedAt,
              customers: record.customers,
              vehicles: record.vehicles,
              jobs: record.jobs,
              items: record.items,
              appointments: record.appointments,
            };
          }),
        );
      },
      read(id: string) {
        return records.get(id) ?? null;
      },
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AndroidAutoBackups: bridge },
    });

    const result = await saveLocalBackup(emptyState('Android Shop'));
    expect(result.storage).toBe('shared');
    expect(result.external).toBe('not-configured');

    const backups = await listLocalBackups();
    expect(backups.find((backup) => backup.id === 'android:42')?.storage).toBe('shared');

    const restored = await getLocalBackup('android:42');
    expect(restored?.state.settings.shopName).toBe('Android Shop');
    expect(restored?.storage).toBe('shared');
  });

  it('copies each snapshot to the chosen external folder', async () => {
    const copies: string[] = [];
    const bridge = {
      save() {
        return true;
      },
      list() {
        return '[]';
      },
      read() {
        return null;
      },
      externalStatus() {
        return JSON.stringify({
          configured: true,
          ready: true,
          label: 'My Drive/Ridgeline backups',
        });
      },
      saveExternal(content: string) {
        copies.push(content);
        return JSON.stringify({ status: 'saved' });
      },
      chooseExternalFolder() {},
      clearExternalFolder() {},
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AndroidAutoBackups: bridge },
    });

    expect(getExternalBackupStatus()).toEqual({
      available: true,
      configured: true,
      ready: true,
      label: 'My Drive/Ridgeline backups',
    });

    const result = await saveLocalBackup(emptyState('Folder Shop'));
    expect(result).toEqual({
      storage: 'shared',
      external: 'saved',
      externalError: '',
    });
    expect(copies).toHaveLength(1);
    expect(JSON.parse(copies[0]).state.settings.shopName).toBe('Folder Shop');
  });

  it('recovers the newest snapshot whose saved state is readable', async () => {
    const records = new Map<string, string>([
      [
        'new',
        JSON.stringify({
          savedAt: '2026-02-02T10:00:00.000Z',
          customers: 0,
          vehicles: 0,
          jobs: 0,
          items: 0,
          appointments: 0,
          state: { settings: { shopName: 'Unreadable Shop', currency: 'PHP' } },
        }),
      ],
      [
        'old',
        JSON.stringify({
          savedAt: '2026-02-01T10:00:00.000Z',
          customers: 0,
          vehicles: 0,
          jobs: 0,
          items: 0,
          appointments: 0,
          state: emptyState('Recovered Shop'),
        }),
      ],
    ]);
    const bridge = {
      save() {
        return true;
      },
      list() {
        return JSON.stringify(
          Array.from(records.entries()).map(([id, content]) => {
            const record = JSON.parse(content) as Record<string, unknown>;
            return {
              id,
              savedAt: record.savedAt,
              customers: record.customers,
              vehicles: record.vehicles,
              jobs: record.jobs,
              items: record.items,
              appointments: record.appointments,
            };
          }),
        );
      },
      read(id: string) {
        return records.get(id) ?? null;
      },
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AndroidAutoBackups: bridge },
    });

    const recovered = await recoverLatestLocalBackup({
      shopName: 'Fallback Shop',
      currency: 'PHP',
    });

    expect(recovered?.backup.id).toBe('android:old');
    expect(recovered?.state.settings.shopName).toBe('Recovered Shop');
  });

  it('returns no recovery when every snapshot state is unreadable', async () => {
    const bridge = {
      save() {
        return true;
      },
      list() {
        return JSON.stringify([
          {
            id: 'bad',
            savedAt: '2026-02-02T10:00:00.000Z',
            customers: 0,
            vehicles: 0,
            jobs: 0,
            items: 0,
            appointments: 0,
          },
        ]);
      },
      read() {
        return JSON.stringify({
          savedAt: '2026-02-02T10:00:00.000Z',
          state: { customers: [] },
        });
      },
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AndroidAutoBackups: bridge },
    });

    expect(
      await recoverLatestLocalBackup({ shopName: 'Fallback Shop', currency: 'PHP' }),
    ).toBeNull();
  });

  it('reports a failed folder copy without losing the shared snapshot', async () => {
    const bridge = {
      save() {
        return true;
      },
      list() {
        return '[]';
      },
      read() {
        return null;
      },
      externalStatus() {
        return JSON.stringify({
          configured: true,
          ready: true,
          label: 'USB SSD',
        });
      },
      saveExternal() {
        return JSON.stringify({
          status: 'failed',
          reason: 'Could not write to the backup folder. Check the connection or free space.',
        });
      },
      chooseExternalFolder() {},
      clearExternalFolder() {},
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AndroidAutoBackups: bridge },
    });

    const result = await saveLocalBackup(emptyState('Fallback Shop'));
    expect(result.storage).toBe('shared');
    expect(result.external).toBe('failed');
    expect(result.externalError).toContain('Check the connection');
  });
});
