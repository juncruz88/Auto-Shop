import { seedState } from '../seed';
import type { AppState, ShopSettings } from '../types';

export interface LoadedShopState {
  state: AppState;
  corrupt: boolean;
}

function isStateObject(value: unknown): value is Partial<AppState> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<AppState>;
  return (
    Array.isArray(candidate.customers) &&
    Array.isArray(candidate.vehicles) &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.jobs) &&
    Array.isArray(candidate.appointments)
  );
}

function isSettings(value: unknown): value is ShopSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const settings = value as Partial<ShopSettings>;
  return typeof settings.shopName === 'string' && typeof settings.currency === 'string';
}

/**
 * Reads the primary shop state. Missing data is a new install; saved data that
 * cannot be parsed or has the wrong shape is reported so the caller can recover
 * a snapshot instead of silently presenting the demo shop.
 */
export function loadStoredState(raw: string | null): LoadedShopState {
  const seeded = seedState();
  if (!raw) return { state: seeded, corrupt: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isStateObject(parsed) ||
      (parsed.settings !== undefined && !isSettings(parsed.settings))
    ) {
      return { state: seeded, corrupt: true };
    }
    return {
      corrupt: false,
      state: {
        ...seeded,
        ...parsed,
        settings: parsed.settings ?? seeded.settings,
        taxRate:
          typeof parsed.taxRate === 'number' && Number.isFinite(parsed.taxRate)
            ? parsed.taxRate
            : seeded.taxRate,
        nextJobNumber:
          typeof parsed.nextJobNumber === 'number' && Number.isFinite(parsed.nextJobNumber)
            ? parsed.nextJobNumber
            : seeded.nextJobNumber,
      } as AppState,
    };
  } catch {
    return { state: seeded, corrupt: true };
  }
}
