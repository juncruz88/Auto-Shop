import type { Job, JobStatus, Tone, Vehicle } from '../types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const CURRENCIES = [
  { code: 'PHP', label: 'Philippine peso (₱)' },
  { code: 'USD', label: 'US dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British pound (£)' },
  { code: 'AUD', label: 'Australian dollar ($)' },
  { code: 'CAD', label: 'Canadian dollar ($)' },
  { code: 'SGD', label: 'Singapore dollar ($)' },
  { code: 'AED', label: 'UAE dirham (د.إ)' },
  { code: 'INR', label: 'Indian rupee (₹)' },
  { code: 'JPY', label: 'Japanese yen (¥)' },
];

const CURRENCY_LOCALES: Record<string, string> = {
  PHP: 'en-PH',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  AUD: 'en-AU',
  CAD: 'en-CA',
  SGD: 'en-SG',
  AED: 'ar-AE',
  INR: 'en-IN',
  JPY: 'ja-JP',
};

export function formatMoney(value: number, currency: string): string {
  try {
    return value.toLocaleString(CURRENCY_LOCALES[currency] ?? 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function jobTotals(job: Pick<Job, 'items'>, taxRate: number) {
  const labor = job.items
    .filter((i) => i.kind === 'labor')
    .reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const parts = job.items
    .filter((i) => i.kind === 'part')
    .reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const subtotal = labor + parts;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  return { labor, parts, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

export const JOB_STATUS: Record<
  JobStatus,
  { label: string; tone: Tone; next?: JobStatus; action?: string }
> = {
  estimate: { label: 'Estimate', tone: 'slate', next: 'approved', action: 'Approve' },
  approved: { label: 'Approved', tone: 'blue', next: 'in-progress', action: 'Start work' },
  'in-progress': { label: 'In progress', tone: 'amber', next: 'ready', action: 'Mark ready' },
  ready: { label: 'Ready for pickup', tone: 'green', next: 'completed', action: 'Complete' },
  completed: { label: 'Completed', tone: 'slate' },
};

export const JOB_STATUS_ORDER: JobStatus[] = [
  'estimate',
  'approved',
  'in-progress',
  'ready',
  'completed',
];

export function vehicleName(vehicle?: Vehicle): string {
  if (!vehicle) return 'No vehicle';
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function plural(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function prettyDate(iso: string): string {
  if (!iso) return 'No date';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function prettyTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
