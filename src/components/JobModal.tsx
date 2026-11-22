import { useState } from 'react';
import { useShop } from '../store';
import type { CatalogItem, Job, LineItem } from '../types';
import { JOB_STATUS, JOB_STATUS_ORDER, addDays, jobTotals, uid } from '../lib/format';
import { Button, Field, Modal } from './ui';
import ScanModal from './ScanModal';

function blankJob(defaultNumber: number, customerId: string, vehicleId: string, mileage: number): Job {
  return {
    id: uid(),
    number: defaultNumber,
    customerId,
    vehicleId,
    status: 'estimate',
    technician: '',
    promisedAt: addDays(1),
    mileageIn: mileage,
    notes: '',
    paid: false,
    createdAt: new Date().toISOString(),
    items: [],
  };
}

export default function JobModal({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const { state, dispatch, money } = useShop();
  const [form, setForm] = useState<Job>(() => {
    if (job) return { ...job, items: job.items.map((item) => ({ ...item })) };
    const customer = state.customers[0];
    const vehicle = state.vehicles.find((v) => v.customerId === customer?.id);
    return blankJob(
      state.nextJobNumber,
      customer?.id ?? '',
      vehicle?.id ?? '',
      vehicle?.mileage ?? 0,
    );
  });
  const [scanning, setScanning] = useState(false);
  const [custom, setCustom] = useState({
    kind: 'labor' as 'labor' | 'part',
    description: '',
    qty: '1',
    price: '',
  });

  const vehicles = state.vehicles.filter((vehicle) => vehicle.customerId === form.customerId);
  const totals = jobTotals(form, state.taxRate);
  const labor = state.items.filter((item) => item.kind === 'labor');
  const parts = state.items.filter((item) => item.kind === 'part');
  const technicians = Array.from(
    new Set(state.jobs.map((entry) => entry.technician).filter(Boolean)),
  );

  const patch = (next: Partial<Job>) => setForm((current) => ({ ...current, ...next }));

  function chooseCustomer(customerId: string) {
    const firstVehicle = state.vehicles.find((vehicle) => vehicle.customerId === customerId);
    setForm((current) => ({
      ...current,
      customerId,
      vehicleId: firstVehicle?.id ?? '',
      mileageIn: firstVehicle?.mileage ?? current.mileageIn,
    }));
  }

  function addItemLine(item: CatalogItem) {
    const line: LineItem = {
      id: uid(),
      itemId: item.id,
      kind: item.kind,
      description: item.name,
      qty: 1,
      unitPrice: item.price,
    };
    patch({ items: [...form.items, line] });
  }

  function addCatalogLine(id: string) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    if (item.kind === 'part' && (item.stock ?? 0) <= 0) return;
    addItemLine(item);
  }

  function addCustomLine() {
    const price = Number(custom.price);
    const qty = Number(custom.qty);
    if (!custom.description.trim() || !Number.isFinite(price) || price < 0) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    const line: LineItem = {
      id: uid(),
      kind: custom.kind,
      description: custom.description.trim(),
      qty,
      unitPrice: price,
    };
    patch({ items: [...form.items, line] });
    setCustom({ kind: custom.kind, description: '', qty: '1', price: '' });
  }

  const valid = Boolean(form.customerId && form.vehicleId);

  return (
    <Modal
      title={job ? `Work order #${job.number}` : 'New work order'}
      subtitle={
        job
          ? `${state.customers.find((c) => c.id === job.customerId)?.name ?? 'Customer'} · ${
              state.vehicles.find((v) => v.id === job.vehicleId)?.plate ?? 'No plate'
            }`
          : 'Write up the job, add labor and parts, then send it for approval.'
      }
      onClose={onClose}
      size="lg"
      footer={
        <>
          <div className="totals-inline">
            <span>
              Labor <strong>{money(totals.labor)}</strong>
            </span>
            <span>
              Parts <strong>{money(totals.parts)}</strong>
            </span>
            <span>
              Tax <strong>{money(totals.tax)}</strong>
            </span>
            <span className="grand">
              Total <strong>{money(totals.total)}</strong>
            </span>
          </div>
          <div className="foot-actions">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={() => {
                dispatch({ type: 'job/save', job: form });
                onClose();
              }}
            >
              {job ? 'Save changes' : 'Create work order'}
            </Button>
          </div>
        </>
      }
    >
      <div className="form-grid cols-2">
        <Field label="Customer">
          <select value={form.customerId} onChange={(event) => chooseCustomer(event.target.value)}>
            <option value="">Select a customer…</option>
            {state.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.phone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vehicle">
          <select
            value={form.vehicleId}
            onChange={(event) => {
              const vehicle = state.vehicles.find((v) => v.id === event.target.value);
              patch({ vehicleId: event.target.value, mileageIn: vehicle?.mileage ?? form.mileageIn });
            }}
            disabled={vehicles.length === 0}
          >
            <option value="">{vehicles.length ? 'Select a vehicle…' : 'No vehicles on file'}</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.plate}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(event) => patch({ status: event.target.value as Job['status'] })}
          >
            {JOB_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {JOB_STATUS[status].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Technician">
          <input
            value={form.technician}
            list="technicians"
            onChange={(event) => patch({ technician: event.target.value })}
            placeholder="Assign to…"
          />
          <datalist id="technicians">
            {technicians.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field label="Promised date">
          <input
            type="date"
            value={form.promisedAt}
            onChange={(event) => patch({ promisedAt: event.target.value })}
          />
        </Field>
        <Field label="Mileage in">
          <input
            type="number"
            value={form.mileageIn || ''}
            onChange={(event) => patch({ mileageIn: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea
            rows={2}
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder="Customer concern, inspection findings, approvals…"
          />
        </Field>
      </div>

      <div className="section-head">
        <h3>Labor & parts</h3>
        <div className="section-actions">
          <span className="muted">{form.items.length} line items</span>
          <Button variant="secondary" size="sm" onClick={() => setScanning(true)}>
            Scan part
          </Button>
        </div>
      </div>

      <div className="line-items">
        {form.items.length === 0 ? (
          <p className="muted">No lines yet. Add a service or part from the catalog below.</p>
        ) : (
          form.items.map((line) => (
            <div className="line-item" key={line.id}>
              <div className="line-main">
                <span className="line-name">{line.description}</span>
                <span className="line-meta">
                  {line.kind === 'labor' ? 'Labor' : 'Part'} · {line.qty} ×{' '}
                  {money(line.unitPrice)}
                </span>
              </div>
              <span className="line-total">{money(line.qty * line.unitPrice)}</span>
              <button
                className="icon-btn small"
                aria-label={`Remove ${line.description}`}
                onClick={() =>
                  patch({ items: form.items.filter((entry) => entry.id !== line.id) })
                }
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="add-line">
        <select
          className="catalog-select"
          value=""
          onChange={(event) => addCatalogLine(event.target.value)}
        >
          <option value="">Add from catalog…</option>
          <optgroup label="Services">
            {labor.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {money(item.price)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Parts">
            {parts.map((item) => (
              <option key={item.id} value={item.id} disabled={(item.stock ?? 0) <= 0}>
                {item.name} — {money(item.price)} ({item.stock ?? 0} in stock)
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="custom-line">
        <select
          value={custom.kind}
          onChange={(event) =>
            setCustom({ ...custom, kind: event.target.value as 'labor' | 'part' })
          }
          aria-label="Line type"
        >
          <option value="labor">Labor</option>
          <option value="part">Part</option>
        </select>
        <input
          placeholder="Custom description"
          value={custom.description}
          onChange={(event) => setCustom({ ...custom, description: event.target.value })}
        />
        <input
          className="narrow"
          type="number"
          min="1"
          value={custom.qty}
          onChange={(event) => setCustom({ ...custom, qty: event.target.value })}
          aria-label="Quantity"
        />
        <input
          className="narrow"
          type="number"
          min="0"
          step="0.01"
          placeholder="Price"
          value={custom.price}
          onChange={(event) => setCustom({ ...custom, price: event.target.value })}
          aria-label="Unit price"
        />
        <Button variant="secondary" onClick={addCustomLine}>
          Add line
        </Button>
      </div>

      <div className="form-grid cols-2">
        <Field label="Invoice note">
          <span className="paid-toggle">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(event) => patch({ paid: event.target.checked })}
            />
            Payment received
          </span>
        </Field>
      </div>

      {scanning ? <ScanModal onClose={() => setScanning(false)} onPick={addItemLine} /> : null}
    </Modal>
  );
}
