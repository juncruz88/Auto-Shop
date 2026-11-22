import { useState } from 'react';
import { useShop } from '../store';
import type { Appointment } from '../types';
import { addDays, prettyDate, prettyTime, today, uid, vehicleName } from '../lib/format';
import { Badge, Button, Empty, Field, Modal, PageHeader } from './ui';

function blankAppointment(customerId: string, vehicleId: string): Appointment {
  return {
    id: uid(),
    customerId,
    vehicleId,
    service: '',
    date: addDays(1),
    time: '09:00',
    durationMin: 60,
    status: 'scheduled',
    notes: '',
  };
}

export default function Schedule() {
  const { state, dispatch } = useShop();
  const [draft, setDraft] = useState<Appointment | null>(null);

  const active = state.appointments.filter(
    (appt) => appt.status === 'scheduled' && appt.date >= today(),
  );
  const upcoming = [...active].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
  );
  const byDate = upcoming.reduce<Record<string, Appointment[]>>((groups, appt) => {
    groups[appt.date] = [...(groups[appt.date] ?? []), appt];
    return groups;
  }, {});
  const history = state.appointments
    .filter((appt) => appt.status !== 'scheduled' || appt.date < today())
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .slice(0, 8);

  const customerOf = (id: string) => state.customers.find((customer) => customer.id === id);
  const vehicleOf = (id: string) => state.vehicles.find((vehicle) => vehicle.id === id);
  const vehicles = draft
    ? state.vehicles.filter((vehicle) => vehicle.customerId === draft.customerId)
    : [];

  function openNew() {
    const customer = state.customers[0];
    const vehicle = state.vehicles.find((entry) => entry.customerId === customer?.id);
    setDraft(blankAppointment(customer?.id ?? '', vehicle?.id ?? ''));
  }

  function save() {
    if (!draft || !draft.customerId || !draft.vehicleId || !draft.service.trim()) return;
    dispatch({
      type: 'appt/save',
      appointment: {
        ...draft,
        service: draft.service.trim(),
        durationMin: Math.max(15, Number(draft.durationMin) || 30),
      },
    });
    setDraft(null);
  }

  return (
    <div className="page">
      <PageHeader
        title="Schedule"
        subtitle={`${upcoming.length} upcoming appointment${upcoming.length === 1 ? '' : 's'}`}
        actions={<Button onClick={openNew}>Book appointment</Button>}
      />

      <section className="card">
        <div className="card-head">
          <h2>Upcoming</h2>
          <span className="muted">Drop-offs, waiters and inspections</span>
        </div>

        {upcoming.length === 0 ? (
          <Empty title="No appointments booked" text="Book a drop-off to fill the bays." />
        ) : (
          Object.keys(byDate).map((date) => (
            <div className="day-group" key={date}>
              <h3 className="day-heading">
                {prettyDate(date)}
                {date === today() ? <span className="today-tag">Today</span> : null}
              </h3>
              <ul className="appt-list">
                {byDate[date].map((appt) => (
                  <li key={appt.id} className="appt">
                    <div className="appt-time">
                      <strong>{prettyTime(appt.time)}</strong>
                      <span>{appt.durationMin} min</span>
                    </div>
                    <div className="appt-main">
                      <span className="row-title">{appt.service}</span>
                      <span className="row-sub">
                        {customerOf(appt.customerId)?.name ?? 'Customer'} ·{' '}
                        {vehicleName(vehicleOf(appt.vehicleId))}
                        {customerOf(appt.customerId)?.phone
                          ? ` · ${customerOf(appt.customerId)?.phone}`
                          : ''}
                      </span>
                      {appt.notes ? <span className="appt-note">{appt.notes}</span> : null}
                    </div>
                    <div className="appt-actions">
                      <Button variant="secondary" size="sm" onClick={() => setDraft({ ...appt })}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          dispatch({ type: 'appt/setStatus', id: appt.id, status: 'done' })
                        }
                      >
                        Check in
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          dispatch({ type: 'appt/setStatus', id: appt.id, status: 'no-show' })
                        }
                      >
                        No-show
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {history.length > 0 ? (
        <section className="card">
          <div className="card-head">
            <h2>Recent history</h2>
          </div>
          <ul className="rows">
            {history.map((appt) => (
              <li key={appt.id} className="row">
                <div className="row-main">
                  <span className="row-title">
                    {appt.service} · {customerOf(appt.customerId)?.name ?? 'Customer'}
                  </span>
                  <span className="row-sub">
                    {prettyDate(appt.date)} at {prettyTime(appt.time)}
                  </span>
                </div>
                <div className="row-side">
                  <Badge
                    tone={appt.status === 'done' ? 'green' : appt.status === 'no-show' ? 'red' : 'amber'}
                  >
                    {appt.status === 'done'
                      ? 'Completed'
                      : appt.status === 'no-show'
                        ? 'No-show'
                        : 'Not checked in'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'appt/delete', id: appt.id })}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft ? (
        <Modal
          title={state.appointments.some((appt) => appt.id === draft.id) ? 'Edit appointment' : 'Book appointment'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={!draft.customerId || !draft.vehicleId || !draft.service.trim()}
              >
                Save appointment
              </Button>
            </>
          }
        >
          <div className="form-grid cols-2">
            <Field label="Customer">
              <select
                value={draft.customerId}
                onChange={(event) => {
                  const customerId = event.target.value;
                  const vehicle = state.vehicles.find((entry) => entry.customerId === customerId);
                  setDraft({ ...draft, customerId, vehicleId: vehicle?.id ?? '' });
                }}
              >
                <option value="">Select a customer…</option>
                {state.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vehicle">
              <select
                value={draft.vehicleId}
                onChange={(event) => setDraft({ ...draft, vehicleId: event.target.value })}
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
            <Field label="Service" className="span-2">
              <input
                value={draft.service}
                list="service-options"
                onChange={(event) => setDraft({ ...draft, service: event.target.value })}
                placeholder="Oil change, brake inspection…"
              />
              <datalist id="service-options">
                {state.items
                  .filter((item) => item.kind === 'labor')
                  .map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
              </datalist>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={draft.time}
                onChange={(event) => setDraft({ ...draft, time: event.target.value })}
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                min="15"
                step="15"
                value={draft.durationMin}
                onChange={(event) =>
                  setDraft({ ...draft, durationMin: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Note" className="span-2">
              <input
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                placeholder="Wait-in, shuttle needed, PO number…"
              />
            </Field>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
