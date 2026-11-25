import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  AppState,
  Appointment,
  ApptStatus,
  CatalogItem,
  Customer,
  ID,
  Job,
  JobStatus,
  ShopSettings,
  Vehicle,
} from './types';
import { seedState } from './seed';
import { formatMoney } from './lib/format';
import {
  AUTO_BACKUP_INTERVAL_MS,
  ensureLocalBackup,
  recoverLatestLocalBackup,
  saveLocalBackup,
} from './lib/localBackups';
import { loadStoredState, type LoadedShopState } from './lib/startup';

const STORAGE_KEY = 'ridgeline-autoshop-v1';

export type Action =
  | { type: 'customer/save'; customer: Customer; vehicles: Vehicle[] }
  | { type: 'customer/delete'; id: ID }
  | { type: 'job/save'; job: Job }
  | { type: 'job/delete'; id: ID }
  | { type: 'job/setStatus'; id: ID; status: JobStatus }
  | { type: 'job/togglePaid'; id: ID }
  | { type: 'item/save'; item: CatalogItem }
  | { type: 'item/delete'; id: ID }
  | { type: 'item/adjustStock'; id: ID; delta: number }
  | { type: 'appt/save'; appointment: Appointment }
  | { type: 'appt/delete'; id: ID }
  | { type: 'appt/setStatus'; id: ID; status: ApptStatus }
  | { type: 'settings/save'; settings: ShopSettings }
  | { type: 'data/import'; state: AppState }
  | { type: 'reset' };

function partsByItem(job?: Job): Map<ID, number> {
  const map = new Map<ID, number>();
  job?.items.forEach((line) => {
    if (line.kind === 'part' && line.itemId) {
      map.set(line.itemId, (map.get(line.itemId) ?? 0) + line.qty);
    }
  });
  return map;
}

/** Keeps inventory in sync with the parts used on a work order. */
function applyStock(items: CatalogItem[], before?: Job, after?: Job): CatalogItem[] {
  const previous = partsByItem(before);
  const next = partsByItem(after);
  const ids = new Set([...previous.keys(), ...next.keys()]);
  let result = items;
  ids.forEach((id) => {
    const used = (next.get(id) ?? 0) - (previous.get(id) ?? 0);
    if (used !== 0) {
      result = result.map((item) =>
        item.id === id ? { ...item, stock: Math.max(0, (item.stock ?? 0) - used) } : item,
      );
    }
  });
  return result;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'customer/save': {
      const exists = state.customers.some((c) => c.id === action.customer.id);
      const customers = exists
        ? state.customers.map((c) => (c.id === action.customer.id ? action.customer : c))
        : [...state.customers, action.customer];

      const keep = new Set(action.vehicles.map((v) => v.id));
      const inUse = new Set(state.jobs.map((j) => j.vehicleId));
      const existingIds = new Set(state.vehicles.map((v) => v.id));

      let vehicles = state.vehicles.map((vehicle) =>
        vehicle.customerId === action.customer.id && keep.has(vehicle.id)
          ? action.vehicles.find((v) => v.id === vehicle.id) ?? vehicle
          : vehicle,
      );
      vehicles = [
        ...vehicles,
        ...action.vehicles.filter((v) => !existingIds.has(v.id)),
      ];
      vehicles = vehicles.filter(
        (v) => v.customerId !== action.customer.id || keep.has(v.id) || inUse.has(v.id),
      );

      const liveVehicleIds = new Set(vehicles.map((v) => v.id));
      return {
        ...state,
        customers,
        vehicles,
        appointments: state.appointments.filter((a) => liveVehicleIds.has(a.vehicleId)),
      };
    }

    case 'customer/delete': {
      if (state.jobs.some((j) => j.customerId === action.id)) return state;
      return {
        ...state,
        customers: state.customers.filter((c) => c.id !== action.id),
        vehicles: state.vehicles.filter((v) => v.customerId !== action.id),
        appointments: state.appointments.filter((a) => a.customerId !== action.id),
      };
    }

    case 'job/save': {
      const previous = state.jobs.find((j) => j.id === action.job.id);
      const jobs = previous
        ? state.jobs.map((j) => (j.id === action.job.id ? action.job : j))
        : [action.job, ...state.jobs];
      return {
        ...state,
        jobs,
        items: applyStock(state.items, previous, action.job),
        nextJobNumber: previous
          ? state.nextJobNumber
          : Math.max(state.nextJobNumber, action.job.number + 1),
      };
    }

    case 'job/delete': {
      const job = state.jobs.find((j) => j.id === action.id);
      if (!job) return state;
      return {
        ...state,
        jobs: state.jobs.filter((j) => j.id !== action.id),
        items: applyStock(state.items, job, undefined),
      };
    }

    case 'job/setStatus':
      return {
        ...state,
        jobs: state.jobs.map((j) => (j.id === action.id ? { ...j, status: action.status } : j)),
      };

    case 'job/togglePaid':
      return {
        ...state,
        jobs: state.jobs.map((j) => (j.id === action.id ? { ...j, paid: !j.paid } : j)),
      };

    case 'item/save': {
      const exists = state.items.some((i) => i.id === action.item.id);
      return {
        ...state,
        items: exists
          ? state.items.map((i) => (i.id === action.item.id ? action.item : i))
          : [...state.items, action.item],
      };
    }

    case 'item/delete':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };

    case 'item/adjustStock':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id
            ? { ...i, stock: Math.max(0, (i.stock ?? 0) + action.delta) }
            : i,
        ),
      };

    case 'appt/save': {
      const exists = state.appointments.some((a) => a.id === action.appointment.id);
      return {
        ...state,
        appointments: exists
          ? state.appointments.map((a) =>
              a.id === action.appointment.id ? action.appointment : a,
            )
          : [...state.appointments, action.appointment],
      };
    }

    case 'appt/delete':
      return {
        ...state,
        appointments: state.appointments.filter((a) => a.id !== action.id),
      };

    case 'appt/setStatus':
      return {
        ...state,
        appointments: state.appointments.map((a) =>
          a.id === action.id ? { ...a, status: action.status } : a,
        ),
      };

    case 'settings/save':
      return { ...state, settings: action.settings };

    case 'data/import':
      return action.state;

    case 'reset':
      return { ...seedState(), settings: state.settings };

    default:
      return state;
  }
}

function initialState(): LoadedShopState {
  try {
    return loadStoredState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return loadStoredState(null);
  }
}

export interface StartupNotice {
  tone: 'success' | 'warning';
  message: string;
}

interface ShopContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  money: (value: number) => string;
  startupNotice: StartupNotice | null;
  dismissStartupNotice: () => void;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const initial = useRef<LoadedShopState>();
  if (!initial.current) initial.current = initialState();
  const initialLoad = initial.current!;
  const [state, dispatch] = useReducer(reducer, initialLoad.state);
  const [booting, setBooting] = useState(initialLoad.corrupt);
  const [startupNotice, setStartupNotice] = useState<StartupNotice | null>(null);
  const firstRender = useRef(true);
  const lastAutoBackup = useRef(0);

  useEffect(() => {
    if (!initialLoad.corrupt) return;
    let cancelled = false;

    void recoverLatestLocalBackup(initialLoad.state.settings)
      .then((recovered) => {
        if (cancelled) return;
        if (recovered) {
          dispatch({ type: 'data/import', state: recovered.state });
          setStartupNotice({
            tone: 'success',
            message:
              'Saved shop data was unreadable. Recovered the latest local snapshot. Review the data and save a new snapshot.',
          });
        } else {
          setStartupNotice({
            tone: 'warning',
            message:
              'Saved shop data was unreadable, and no valid local snapshot was found. The app started with demo data. Restore a backup before making changes.',
          });
        }
        setBooting(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStartupNotice({
          tone: 'warning',
          message:
            'Saved shop data was unreadable, and local snapshots could not be checked. The app started with demo data. Restore a backup before making changes.',
        });
        setBooting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialLoad]);

  useEffect(() => {
    if (booting) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode) — the app still works in memory.
    }

    if (firstRender.current) {
      firstRender.current = false;
      lastAutoBackup.current = Date.now();
      void ensureLocalBackup(state).catch(() => {
        // Local snapshots are best-effort; the main state is still saved above.
      });
      return;
    }

    const now = Date.now();
    if (now - lastAutoBackup.current < AUTO_BACKUP_INTERVAL_MS) return;
    lastAutoBackup.current = now;
    void saveLocalBackup(state).catch(() => {
      // Keep the app usable if IndexedDB is unavailable or full.
    });
  }, [state, booting]);

  const money = useCallback(
    (value: number) => formatMoney(value, state.settings.currency),
    [state.settings.currency],
  );
  const dismissStartupNotice = useCallback(() => setStartupNotice(null), []);
  const value = useMemo(
    () => ({ state, dispatch, money, startupNotice, dismissStartupNotice }),
    [state, money, startupNotice, dismissStartupNotice],
  );

  if (booting) {
    return (
      <div className="page">
        <p className="page-status" role="status">
          Saved shop data is unreadable. Checking local snapshots…
        </p>
      </div>
    );
  }

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (!context) throw new Error('useShop must be used inside ShopProvider');
  return context;
}
