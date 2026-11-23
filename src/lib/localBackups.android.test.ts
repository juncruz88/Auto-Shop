import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import { getLocalBackup, listLocalBackups, saveLocalBackup } from './localBackups';

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

    expect(await saveLocalBackup(emptyState('Android Shop'))).toBe('shared');

    const backups = await listLocalBackups();
    expect(backups.find((backup) => backup.id === 'android:42')?.storage).toBe('shared');

    const restored = await getLocalBackup('android:42');
    expect(restored?.state.settings.shopName).toBe('Android Shop');
    expect(restored?.storage).toBe('shared');
  });
});
