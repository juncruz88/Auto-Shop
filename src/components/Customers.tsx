import { useState } from 'react';
import { useShop } from '../store';
import type { Customer, Vehicle } from '../types';
import { uid } from '../lib/format';
import { Avatar, Button, Empty, Field, Modal, PageHeader } from './ui';

type Draft = { customer: Customer; vehicles: Vehicle[] };

const blankCustomer = (): Customer => ({
  id: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  createdAt: new Date().toISOString(),
});

const blankVehicle = (customerId: string): Vehicle => ({
  id: '',
  customerId,
  year: new Date().getFullYear(),
  make: '',
  model: '',
  vin: '',
  plate: '',
  mileage: 0,
});

export default function Customers() {
  const { state, dispatch } = useShop();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const search = query.trim().toLowerCase();
  const customers = [...state.customers]
    .filter((customer) => {
      if (!search) return true;
      const vehicles = state.vehicles.filter((vehicle) => vehicle.customerId === customer.id);
      const haystack = [
        customer.name,
        customer.phone,
        customer.email,
        ...vehicles.map((v) => `${v.year} ${v.make} ${v.model} ${v.plate}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function openNew() {
    const customer = blankCustomer();
    setDraft({ customer, vehicles: [blankVehicle(customer.id)] });
  }

  function openEdit(customer: Customer) {
    const vehicles = state.vehicles.filter((vehicle) => vehicle.customerId === customer.id);
    setDraft({
      customer: { ...customer },
      vehicles: vehicles.length > 0 ? vehicles.map((v) => ({ ...v })) : [blankVehicle(customer.id)],
    });
  }

  function save() {
    if (!draft || !draft.customer.name.trim()) return;
    const customerId = draft.customer.id || uid();
    const customer: Customer = {
      ...draft.customer,
      id: customerId,
      name: draft.customer.name.trim(),
      createdAt: draft.customer.createdAt || new Date().toISOString(),
    };
    const vehicles = draft.vehicles
      .filter((vehicle) => vehicle.make.trim() || vehicle.model.trim())
      .map((vehicle) => ({ ...vehicle, id: vehicle.id || uid(), customerId }));
    dispatch({ type: 'customer/save', customer, vehicles });
    setDraft(null);
  }

  function remove(customer: Customer) {
    const jobs = state.jobs.filter((job) => job.customerId === customer.id).length;
    if (jobs > 0) {
      window.alert(
        `This customer has ${jobs} work order${jobs === 1 ? '' : 's'}. Close and delete them first.`,
      );
      return;
    }
    if (window.confirm(`Delete ${customer.name} and their vehicles?`)) {
      dispatch({ type: 'customer/delete', id: customer.id });
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Customers"
        subtitle={`${state.customers.length} customers · ${state.vehicles.length} vehicles on file`}
        actions={
          <>
            <input
              className="search"
              placeholder="Search name, plate or vehicle…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button onClick={openNew}>Add customer</Button>
          </>
        }
      />

      <section className="card">
        {customers.length === 0 ? (
          <Empty title="No customers found" text="Try a different search or add a customer." />
        ) : (
          <>
            <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Vehicles</th>
                  <th>Open jobs</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const vehicles = state.vehicles.filter((v) => v.customerId === customer.id);
                  const openJobs = state.jobs.filter(
                    (job) => job.customerId === customer.id && job.status !== 'completed',
                  ).length;
                  return (
                    <tr key={customer.id}>
                      <td>
                        <span className="cell-title">{customer.name}</span>
                        {customer.address ? (
                          <span className="cell-sub">{customer.address}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className="cell-title">{customer.phone || '—'}</span>
                        <span className="cell-sub">{customer.email || 'No email'}</span>
                      </td>
                      <td>
                        {vehicles.length === 0 ? (
                          <span className="muted">No vehicles</span>
                        ) : (
                          <div className="chip-row">
                            {vehicles.map((vehicle) => (
                              <span key={vehicle.id} className="vehicle-chip">
                                {vehicle.year} {vehicle.make} {vehicle.model}
                                <em>{vehicle.plate || 'no plate'}</em>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>{openJobs > 0 ? openJobs : <span className="muted">—</span>}</td>
                      <td className="right">
                        <div className="actions">
                          <Button variant="secondary" size="sm" onClick={() => openEdit(customer)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(customer)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="mobile-cards">
              {customers.map((customer) => {
                const vehicles = state.vehicles.filter((v) => v.customerId === customer.id);
                const openJobs = state.jobs.filter(
                  (job) => job.customerId === customer.id && job.status !== 'completed',
                ).length;
                return (
                  <article className="customer-card" key={customer.id}>
                    <div className="customer-card-head">
                      <Avatar name={customer.name} />
                      <div className="row-main">
                        <span className="row-title">{customer.name}</span>
                        <span className="row-sub">{customer.phone || 'No phone'}</span>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(customer)}>
                        Edit
                      </Button>
                    </div>
                    {vehicles.length > 0 ? (
                      <div className="chip-row">
                        {vehicles.map((vehicle) => (
                          <span key={vehicle.id} className="vehicle-chip">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                            <em>{vehicle.plate || 'no plate'}</em>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">No vehicles on file</span>
                    )}
                    <div className="customer-card-foot">
                      <span className="muted">
                        {openJobs > 0
                          ? `${openJobs} open job${openJobs === 1 ? '' : 's'}`
                          : 'No open jobs'}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => remove(customer)}>
                        Delete
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {draft ? (
        <Modal
          title={draft.customer.id ? 'Edit customer' : 'New customer'}
          subtitle="Keep contact details and every vehicle in one place."
          onClose={() => setDraft(null)}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!draft.customer.name.trim()}>
                Save customer
              </Button>
            </>
          }
        >
          <div className="form-grid cols-2">
            <Field label="Full name">
              <input
                value={draft.customer.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    customer: { ...draft.customer, name: event.target.value },
                  })
                }
                placeholder="Jordan Reyes"
                autoFocus
              />
            </Field>
            <Field label="Phone">
              <input
                value={draft.customer.phone}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    customer: { ...draft.customer, phone: event.target.value },
                  })
                }
                placeholder="(512) 555-0100"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={draft.customer.email}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    customer: { ...draft.customer, email: event.target.value },
                  })
                }
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Address">
              <input
                value={draft.customer.address}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    customer: { ...draft.customer, address: event.target.value },
                  })
                }
                placeholder="Street, city"
              />
            </Field>
            <Field label="Notes" className="span-2">
              <textarea
                rows={2}
                value={draft.customer.notes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    customer: { ...draft.customer, notes: event.target.value },
                  })
                }
                placeholder="Preferences, approvals, payment terms…"
              />
            </Field>
          </div>

          <div className="section-head">
            <h3>Vehicles</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setDraft({ ...draft, vehicles: [...draft.vehicles, blankVehicle(draft.customer.id)] })
              }
            >
              Add vehicle
            </Button>
          </div>

          {draft.vehicles.length === 0 ? (
            <p className="muted">No vehicles yet — add one so work orders can be created.</p>
          ) : (
            draft.vehicles.map((vehicle, index) => {
              const update = (patch: Partial<Vehicle>) =>
                setDraft({
                  ...draft,
                  vehicles: draft.vehicles.map((v, i) => (i === index ? { ...v, ...patch } : v)),
                });
              const hasJobs = state.jobs.some((job) => job.vehicleId === vehicle.id);
              return (
                <div className="vehicle-form" key={vehicle.id || index}>
                  <div className="form-grid cols-4">
                    <Field label="Year">
                      <input
                        type="number"
                        value={vehicle.year || ''}
                        onChange={(event) =>
                          update({ year: Number(event.target.value) || 0 })
                        }
                      />
                    </Field>
                    <Field label="Make">
                      <input
                        value={vehicle.make}
                        onChange={(event) => update({ make: event.target.value })}
                        placeholder="Toyota"
                      />
                    </Field>
                    <Field label="Model">
                      <input
                        value={vehicle.model}
                        onChange={(event) => update({ model: event.target.value })}
                        placeholder="Camry"
                      />
                    </Field>
                    <Field label="Plate">
                      <input
                        value={vehicle.plate}
                        onChange={(event) => update({ plate: event.target.value })}
                        placeholder="HXK-4412"
                      />
                    </Field>
                    <Field label="VIN" className="span-2">
                      <input
                        value={vehicle.vin}
                        onChange={(event) => update({ vin: event.target.value })}
                        placeholder="17 characters"
                      />
                    </Field>
                    <Field label="Mileage">
                      <input
                        type="number"
                        value={vehicle.mileage || ''}
                        onChange={(event) =>
                          update({ mileage: Number(event.target.value) || 0 })
                        }
                      />
                    </Field>
                    <div className="field align-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={hasJobs}
                        title={hasJobs ? 'Vehicle has work orders on file' : 'Remove vehicle'}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            vehicles: draft.vehicles.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Modal>
      ) : null}
    </div>
  );
}
