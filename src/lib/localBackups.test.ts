import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import {
  getLocalBackup,
  listLocalBackups,
  MAX_LOCAL_BACKUPS,
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

describe('local backups', () => {
  it('keeps only the newest snapshots and reads them back', async () => {
    expect(await listLocalBackups()).toEqual([]);

    for (let index = 0; index < MAX_LOCAL_BACKUPS + 2; index += 1) {
      expect((await saveLocalBackup(emptyState(`Shop ${index}`))).storage).toBe('app');
    }

    const backups = await listLocalBackups();
    expect(backups).toHaveLength(MAX_LOCAL_BACKUPS);
    expect(backups.every((backup) => backup.storage === 'app')).toBe(true);

    const ids = backups
      .map((backup) => Number(backup.id.replace('idb:', '')))
      .sort((a, b) => a - b);
    expect(ids[ids.length - 1] - ids[0]).toBe(MAX_LOCAL_BACKUPS - 1);

    const newest = await getLocalBackup(`idb:${ids[ids.length - 1]}`);
    expect(newest?.state.settings.shopName).toBe(`Shop ${MAX_LOCAL_BACKUPS + 1}`);
    expect(newest?.storage).toBe('app');
    expect(newest?.customers).toBe(0);

    const oldest = await getLocalBackup(`idb:${ids[0]}`);
    expect(oldest?.state.settings.shopName).toBe('Shop 2');
  });
});
