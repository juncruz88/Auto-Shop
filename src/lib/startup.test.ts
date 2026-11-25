import { describe, expect, it } from 'vitest';
import { loadStoredState } from './startup';

function savedState(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    customers: [],
    vehicles: [],
    items: [],
    jobs: [],
    appointments: [],
    settings: { shopName: 'Saved Shop', currency: 'USD' },
    taxRate: 0.1,
    nextJobNumber: 1001,
    ...overrides,
  });
}

describe('loadStoredState', () => {
  it('treats missing saved data as a new install', () => {
    const loaded = loadStoredState(null);

    expect(loaded.corrupt).toBe(false);
    expect(loaded.state.customers.length).toBeGreaterThan(0);
  });

  it('loads a valid saved shop without flagging corruption', () => {
    const loaded = loadStoredState(savedState());

    expect(loaded.corrupt).toBe(false);
    expect(loaded.state.settings).toEqual({ shopName: 'Saved Shop', currency: 'USD' });
    expect(loaded.state.customers).toEqual([]);
  });

  it('flags malformed JSON as corrupt', () => {
    expect(loadStoredState('{"customers":').corrupt).toBe(true);
  });

  it('flags saved data with missing collections as corrupt', () => {
    expect(loadStoredState(JSON.stringify({ customers: [] })).corrupt).toBe(true);
  });

  it('flags an invalid settings object as corrupt', () => {
    expect(loadStoredState(savedState({ settings: 'broken' })).corrupt).toBe(true);
  });

  it('falls back for invalid numeric fields instead of treating the shop as corrupt', () => {
    const fallback = loadStoredState(null).state;
    const loaded = loadStoredState(
      savedState({ taxRate: 'not-a-number', nextJobNumber: null }),
    );

    expect(loaded.corrupt).toBe(false);
    expect(loaded.state.taxRate).toBe(fallback.taxRate);
    expect(loaded.state.nextJobNumber).toBe(fallback.nextJobNumber);
  });
});
