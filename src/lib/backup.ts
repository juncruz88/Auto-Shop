import type {
  Appointment,
  ApptStatus,
  AppState,
  CatalogItem,
  Customer,
  Job,
  JobStatus,
  LineItem,
  ShopSettings,
  Vehicle,
} from '../types';
import { CURRENCIES, addDays, plural, today, uid } from './format';

declare global {
  interface Window {
    AndroidBackup?: { save: (filename: string, content: string) => void };
  }
}

const APP_ID = 'ridgeline-autoshop';
const MAX_ENTRIES = 20_000;
const MAX_PRICE = 10_000_000;
const JOB_STATUSES: readonly JobStatus[] = [
  'estimate',
  'approved',
  'in-progress',
  'ready',
  'completed',
];
const APPT_STATUSES: readonly ApptStatus[] = ['scheduled', 'done', 'no-show'];
const CURRENCY_CODES = CURRENCIES.map((option) => option.code);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function wholeNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function isoOr(value: unknown): string {
  if (typeof value === 'string') {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return new Date().toISOString();
}

function dateOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && DATE.test(value) ? value : fallback;
}

function timeOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && TIME.test(value) ? value : fallback;
}

function customersFrom(input: unknown[]): { items: Customer[]; skipped: number } {
  const seen = new Set<string>();
  const items: Customer[] = [];
  let skipped = 0;
  for (const entry of input) {
    const id = isObject(entry) ? cleanText(entry.id, 64) : '';
    const name = isObject(entry) ? cleanText(entry.name, 80) : '';
    if (!isObject(entry) || !id || !name || seen.has(id)) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    items.push({
      id,
      name,
      phone: cleanText(entry.phone, 40),
      email: cleanText(entry.email, 120),
      address: cleanText(entry.address, 160),
      notes: cleanText(entry.notes, 2000),
      createdAt: isoOr(entry.createdAt),
    });
  }
  return { items, skipped };
}

function vehiclesFrom(
  input: unknown[],
  customerIds: Set<string>,
): { items: Vehicle[]; skipped: number } {
  const seen = new Set<string>();
  const items: Vehicle[] = [];
  let skipped = 0;
  for (const entry of input) {
    if (!isObject(entry)) {
      skipped += 1;
      continue;
    }
    const id = cleanText(entry.id, 64);
    const customerId = cleanText(entry.customerId, 64);
    const make = cleanText(entry.make, 40);
    const model = cleanText(entry.model, 60);
    if (!id || seen.has(id) || !customerIds.has(customerId) || (!make && !model)) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    items.push({
      id,
      customerId,
      year: wholeNumber(entry.year, new Date().getFullYear(), 1900, 2100),
      make,
      model,
      vin: cleanText(entry.vin, 32),
      plate: cleanText(entry.plate, 16),
      mileage: wholeNumber(entry.mileage, 0, 0, 2_000_000),
    });
  }
  return { items, skipped };
}

function itemsFrom(input: unknown[]): { items: CatalogItem[]; skipped: number } {
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  let skipped = 0;
  for (const entry of input) {
    if (!isObject(entry)) {
      skipped += 1;
      continue;
    }
    const id = cleanText(entry.id, 64);
    const name = cleanText(entry.name, 80);
    if (!id || !name || seen.has(id)) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    const kind = entry.kind === 'part' ? 'part' : 'labor';
    items.push({
      id,
      kind,
      name,
      price: clampNumber(entry.price, 0, 0, MAX_PRICE),
      ...(kind === 'part'
        ? {
            sku: cleanText(entry.sku, 40),
            stock: wholeNumber(entry.stock, 0, 0, 1_000_000),
            reorderAt: wholeNumber(entry.reorderAt, 0, 0, 1_000_000),
          }
        : {}),
    });
  }
  return { items, skipped };
}

function linesFrom(input: unknown, itemIds: Set<string>): LineItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const lines: LineItem[] = [];
  for (const entry of input) {
    if (!isObject(entry)) continue;
    const description = cleanText(entry.description, 120);
    if (!description) continue;
    const id = cleanText(entry.id, 64) || uid();
    if (seen.has(id)) continue;
    seen.add(id);
    const itemId = cleanText(entry.itemId, 64);
    lines.push({
      id,
      ...(itemId && itemIds.has(itemId) ? { itemId } : {}),
      kind: entry.kind === 'part' ? 'part' : 'labor',
      description,
      qty: wholeNumber(entry.qty, 1, 1, 999),
      unitPrice: clampNumber(entry.unitPrice, 0, 0, MAX_PRICE),
    });
    if (lines.length >= 200) break;
  }
  return lines;
}

function jobsFrom(
  input: unknown[],
  customerIds: Set<string>,
  vehicles: Map<string, Vehicle>,
  itemIds: Set<string>,
): { items: Job[]; skipped: number } {
  const seen = new Set<string>();
  const items: Job[] = [];
  let skipped = 0;
  for (const entry of input) {
    if (!isObject(entry)) {
      skipped += 1;
      continue;
    }
    const id = cleanText(entry.id, 64);
    const customerId = cleanText(entry.customerId, 64);
    const vehicle = vehicles.get(cleanText(entry.vehicleId, 64));
    if (!id || seen.has(id) || !customerIds.has(customerId) || !vehicle) {
      skipped += 1;
      continue;
    }
    if (vehicle.customerId !== customerId) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    items.push({
      id,
      number: wholeNumber(entry.number, 0, 0, 999_999),
      customerId,
      vehicleId: vehicle.id,
      status: oneOf(entry.status, JOB_STATUSES, 'estimate'),
      technician: cleanText(entry.technician, 80),
      promisedAt: dateOr(entry.promisedAt, addDays(1)),
      mileageIn: wholeNumber(entry.mileageIn, vehicle.mileage, 0, 2_000_000),
      notes: cleanText(entry.notes, 2000),
      paid: entry.paid === true,
      createdAt: isoOr(entry.createdAt),
      items: linesFrom(entry.items, itemIds),
    });
  }

  const usedNumbers = new Set<number>();
  let highest = 1000;
  for (const job of items) highest = Math.max(highest, job.number);
  for (const job of items) {
    if (job.number === 0 || usedNumbers.has(job.number)) {
      highest += 1;
      job.number = highest;
    }
    usedNumbers.add(job.number);
  }

  return { items, skipped };
}

function appointmentsFrom(
  input: unknown[],
  customerIds: Set<string>,
  vehicles: Map<string, Vehicle>,
): { items: Appointment[]; skipped: number } {
  const seen = new Set<string>();
  const items: Appointment[] = [];
  let skipped = 0;
  for (const entry of input) {
    if (!isObject(entry)) {
      skipped += 1;
      continue;
    }
    const id = cleanText(entry.id, 64);
    const customerId = cleanText(entry.customerId, 64);
    const vehicle = vehicles.get(cleanText(entry.vehicleId, 64));
    const service = cleanText(entry.service, 100);
    if (!id || seen.has(id) || !customerIds.has(customerId) || !vehicle || !service) {
      skipped += 1;
      continue;
    }
    if (vehicle.customerId !== customerId) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    items.push({
      id,
      customerId,
      vehicleId: vehicle.id,
      service,
      date: dateOr(entry.date, today()),
      time: timeOr(entry.time, '09:00'),
      durationMin: wholeNumber(entry.durationMin, 30, 15, 480),
      status: oneOf(entry.status, APPT_STATUSES, 'scheduled'),
      notes: cleanText(entry.notes, 500),
    });
  }
  return { items, skipped };
}

function settingsFrom(value: unknown, fallback: ShopSettings): ShopSettings {
  const entry = isObject(value) ? value : {};
  return {
    shopName: cleanText(entry.shopName, 60) || fallback.shopName,
    currency: oneOf(entry.currency, CURRENCY_CODES, fallback.currency),
  };
}

export interface RestorePreview {
  state: AppState;
  notes: string[];
}

/**
 * Parses a backup file into a safe, fully-populated state.
 * Anything malformed is repaired or skipped rather than trusted.
 */
export function readBackup(text: string, fallback: ShopSettings): RestorePreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const wrapper = isObject(parsed) ? parsed : {};
  if (typeof wrapper.app === 'string' && wrapper.app !== APP_ID) {
    throw new Error('That JSON belongs to a different app.');
  }

  const candidate = isObject(wrapper.state) ? wrapper.state : parsed;
  if (!isObject(candidate)) {
    throw new Error('This file is not a shop backup.');
  }

  for (const key of ['customers', 'vehicles', 'items', 'jobs', 'appointments'] as const) {
    if (!Array.isArray(candidate[key])) {
      throw new Error('This file is not a shop backup.');
    }
    if (candidate[key].length > MAX_ENTRIES) {
      throw new Error('This backup has too many records to restore.');
    }
  }

  const customers = customersFrom(candidate.customers as unknown[]);
  const customerIds = new Set(customers.items.map((customer) => customer.id));
  const vehicles = vehiclesFrom(candidate.vehicles as unknown[], customerIds);
  const vehicleMap = new Map(vehicles.items.map((vehicle) => [vehicle.id, vehicle]));
  const catalog = itemsFrom(candidate.items as unknown[]);
  const itemIds = new Set(catalog.items.map((item) => item.id));
  const jobs = jobsFrom(candidate.jobs as unknown[], customerIds, vehicleMap, itemIds);
  const appointments = appointmentsFrom(
    candidate.appointments as unknown[],
    customerIds,
    vehicleMap,
  );

  const notes: string[] = [];
  if (customers.skipped) notes.push(`${plural(customers.skipped, 'customer')} skipped`);
  if (vehicles.skipped) notes.push(`${plural(vehicles.skipped, 'vehicle')} skipped`);
  if (catalog.skipped) notes.push(`${plural(catalog.skipped, 'catalog item')} skipped`);
  if (jobs.skipped) notes.push(`${plural(jobs.skipped, 'work order')} skipped`);
  if (appointments.skipped) notes.push(`${plural(appointments.skipped, 'appointment')} skipped`);

  const jobsList = jobs.items;
  const highestJob = jobsList.reduce((highest, job) => Math.max(highest, job.number), 1000);

  return {
    notes,
    state: {
      customers: customers.items,
      vehicles: vehicles.items,
      items: catalog.items,
      jobs: jobsList,
      appointments: appointments.items,
      settings: settingsFrom(candidate.settings, fallback),
      taxRate: clampNumber(candidate.taxRate, 0.0825, 0, 0.5),
      nextJobNumber: Math.max(
        wholeNumber(candidate.nextJobNumber, 1001, 1, 999_999_999),
        highestJob + 1,
      ),
    },
  };
}

interface SaveHandle {
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
}

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

export type SaveResult = 'android' | 'saved' | 'cancelled' | 'download';

export function backupFilename(shopName: string): string {
  const slug = shopName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'shop'}-backup-${today()}.json`;
}

function createBackupJson(state: AppState): string {
  return JSON.stringify(
    {
      app: APP_ID,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}

/** Saves a backup where the platform lets the user choose: SD card, Downloads, cloud or Files. */
export async function saveBackupFile(state: AppState): Promise<SaveResult> {
  const filename = backupFilename(state.settings.shopName);
  const json = createBackupJson(state);

  if (window.AndroidBackup?.save) {
    window.AndroidBackup.save(filename, json);
    return 'android';
  }

  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Shop backup', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return 'saved';
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') return 'cancelled';
      // Any other picker failure falls back to a normal download.
    }
  }

  const href =
    location.protocol === 'file:'
      ? `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
      : URL.createObjectURL(new Blob([json], { type: 'application/json' }));

  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (href.startsWith('blob:')) {
    window.setTimeout(() => URL.revokeObjectURL(href), 2000);
  }
  return 'download';
}
