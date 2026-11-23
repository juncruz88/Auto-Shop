import { describe, expect, it } from 'vitest';
import type { ShopSettings } from '../types';
import { readBackup } from './backup';

const FALLBACK: ShopSettings = { shopName: 'Fallback Shop', currency: 'PHP' };
const CREATED = '2026-01-02T03:04:05.000Z';

function fixture() {
  return {
    customers: [
      {
        id: 'c1',
        name: ' Ana Cruz ',
        phone: '0917 555 0100',
        email: 'ana@example.com',
        address: '1 Main Street',
        notes: 'VIP',
        createdAt: CREATED,
      },
    ],
    vehicles: [
      {
        id: 'v1',
        customerId: 'c1',
        year: 2020,
        make: 'Toyota',
        model: 'Hilux',
        vin: 'VIN123',
        plate: 'ABC 123',
        mileage: 12_000,
      },
    ],
    items: [
      { id: 'part-1', kind: 'part', name: 'Oil filter', price: 350, sku: 'OF-1', stock: 4, reorderAt: 2 },
      { id: 'labor-1', kind: 'labor', name: 'Oil change labour', price: 500 },
    ],
    jobs: [
      {
        id: 'job-1',
        number: 1005,
        customerId: 'c1',
        vehicleId: 'v1',
        status: 'approved',
        technician: 'Rex',
        promisedAt: '2026-02-01',
        mileageIn: 12_000,
        notes: 'Customer waits',
        paid: false,
        createdAt: CREATED,
        items: [
          {
            id: 'line-1',
            itemId: 'part-1',
            kind: 'part',
            description: 'Oil filter',
            qty: 2,
            unitPrice: 350,
          },
        ],
      },
    ],
    appointments: [
      {
        id: 'appt-1',
        customerId: 'c1',
        vehicleId: 'v1',
        service: 'Oil change',
        date: '2026-02-02',
        time: '09:30',
        durationMin: 45,
        status: 'scheduled',
        notes: '',
      },
    ],
    settings: { shopName: 'Test Shop', currency: 'USD' },
    nextJobNumber: 1006,
    taxRate: 0.1,
  };
}

function backup(state: unknown): string {
  return JSON.stringify({ app: 'ridgeline-autoshop', exportedAt: CREATED, state });
}

describe('readBackup', () => {
  it('normalises a valid wrapped backup', () => {
    const preview = readBackup(backup(fixture()), FALLBACK);

    expect(preview.notes).toEqual([]);
    expect(preview.state.customers[0].name).toBe('Ana Cruz');
    expect(preview.state.customers[0].phone).toBe('0917 555 0100');
    expect(preview.state.vehicles[0].plate).toBe('ABC 123');
    expect(preview.state.items[0]).toMatchObject({
      kind: 'part',
      sku: 'OF-1',
      stock: 4,
      reorderAt: 2,
    });
    expect(preview.state.jobs[0].items[0].itemId).toBe('part-1');
    expect(preview.state.appointments[0].time).toBe('09:30');
    expect(preview.state.settings).toEqual({ shopName: 'Test Shop', currency: 'USD' });
    expect(preview.state.nextJobNumber).toBe(1006);
    expect(preview.state.taxRate).toBe(0.1);
  });

  it('accepts a bare state object', () => {
    const preview = readBackup(JSON.stringify(fixture()), FALLBACK);

    expect(preview.state.jobs).toHaveLength(1);
    expect(preview.state.customers).toHaveLength(1);
  });

  it('rejects JSON from another app', () => {
    expect(() =>
      readBackup(JSON.stringify({ app: 'other-shop', state: fixture() }), FALLBACK),
    ).toThrow(/different app/);
  });

  it('rejects malformed JSON', () => {
    expect(() => readBackup('{not json', FALLBACK)).toThrow(/not valid JSON/);
  });

  it('rejects objects that are not shop backups', () => {
    expect(() => readBackup(JSON.stringify({ app: 'ridgeline-autoshop' }), FALLBACK)).toThrow(
      /not a shop backup/,
    );
    expect(() =>
      readBackup(JSON.stringify({ app: 'ridgeline-autoshop', state: { customers: [] } }), FALLBACK),
    ).toThrow(/not a shop backup/);
  });

  it('rejects an oversized backup', () => {
    const oversized = fixture();
    oversized.customers = Array.from({ length: 20_001 }, () => ({})) as never;
    expect(() => readBackup(backup(oversized), FALLBACK)).toThrow(/too many records/);
  });

  it('repairs invalid references, enums, numbers, dates and settings', () => {
    const raw = fixture();

    raw.customers.push({ id: 'c1', name: 'Duplicate customer' } as never);
    raw.vehicles.push({
      id: 'v2',
      customerId: 'missing-customer',
      make: 'Ford',
      model: 'Focus',
    } as never);
    raw.items.push({
      id: 'part-2',
      kind: 'mystery',
      name: 'Air filter',
      price: -10,
      stock: -5,
      reorderAt: -3,
    } as never);
    raw.jobs.push({
      id: 'job-2',
      number: 1005,
      customerId: 'c1',
      vehicleId: 'v1',
      status: 'broken',
      technician: '',
      promisedAt: 'not-a-date',
      mileageIn: -50,
      notes: '',
      paid: 'yes',
      createdAt: 'not-a-date',
      items: [
        {
          id: 'line-2',
          itemId: 'missing-part',
          kind: 'part',
          description: 'Unknown part',
          qty: -2,
          unitPrice: -5,
        },
      ],
    } as never);
    raw.appointments.push({
      id: 'appt-2',
      customerId: 'c1',
      vehicleId: 'v1',
      service: '   ',
      date: 'bad',
      time: '99:99',
      durationMin: 1,
      status: 'bad',
      notes: '',
    } as never);
    raw.settings = { shopName: '   ', currency: 'XXX' };
    raw.nextJobNumber = 1;
    raw.taxRate = 9;

    const preview = readBackup(backup(raw), FALLBACK);

    expect(preview.notes).toEqual([
      '1 customer skipped',
      '1 vehicle skipped',
      '1 appointment skipped',
    ]);
    expect(preview.state.customers).toHaveLength(1);
    expect(preview.state.vehicles).toHaveLength(1);
    expect(preview.state.appointments).toHaveLength(1);

    const repairedItem = preview.state.items.find((item) => item.id === 'part-2');
    expect(repairedItem).toMatchObject({ kind: 'labor', price: 0 });
    expect(repairedItem?.stock).toBeUndefined();

    const repairedJob = preview.state.jobs[1];
    expect(repairedJob.status).toBe('estimate');
    expect(repairedJob.paid).toBe(false);
    expect(repairedJob.mileageIn).toBe(0);
    expect(repairedJob.promisedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(repairedJob.createdAt))).toBe(false);
    expect(repairedJob.items[0].itemId).toBeUndefined();
    expect(repairedJob.items[0]).toMatchObject({ qty: 1, unitPrice: 0 });

    expect(preview.state.jobs.map((job) => job.number)).toEqual([1005, 1006]);
    expect(preview.state.nextJobNumber).toBe(1007);
    expect(preview.state.settings).toEqual(FALLBACK);
    expect(preview.state.taxRate).toBe(0.5);
  });
});
