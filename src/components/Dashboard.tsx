import type { TabId } from '../types';
import { useShop } from '../store';
import { JOB_STATUS, jobTotals, prettyTime, today, vehicleName } from '../lib/format';
import { Badge, Button, Empty, PageHeader, Stat } from './ui';

export default function Dashboard({ navigate }: { navigate: (tab: TabId) => void }) {
  const { state, money } = useShop();
  const active = state.jobs
    .filter((job) => job.status !== 'completed')
    .sort((a, b) => b.number - a.number);
  const inBay = state.jobs.filter((job) => job.status === 'in-progress').length;
  const ready = state.jobs.filter((job) => job.status === 'ready').length;
  const unpaid = state.jobs
    .filter((job) => !job.paid && job.status !== 'estimate')
    .reduce((sum, job) => sum + jobTotals(job, state.taxRate).total, 0);
  const collected = state.jobs
    .filter((job) => job.paid)
    .reduce((sum, job) => sum + jobTotals(job, state.taxRate).total, 0);
  const todays = state.appointments
    .filter((appt) => appt.date === today() && appt.status === 'scheduled')
    .sort((a, b) => a.time.localeCompare(b.time));
  const lowStock = state.items.filter(
    (item) => item.kind === 'part' && (item.stock ?? 0) <= (item.reorderAt ?? 0),
  );

  const customerOf = (id: string) => state.customers.find((customer) => customer.id === id);
  const vehicleOf = (id: string) => state.vehicles.find((vehicle) => vehicle.id === id);

  return (
    <div className="page">
      <PageHeader
        title="Shop overview"
        subtitle={new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
        actions={<Button onClick={() => navigate('jobs')}>Open work orders</Button>}
      />

      <div className="stats">
        <Stat
          label="Active work orders"
          value={String(active.length)}
          hint={`${inBay} in the bay · ${ready} ready for pickup`}
        />
        <Stat
          label="Unpaid balance"
          value={money(unpaid)}
          hint="Approved and completed invoices"
        />
        <Stat label="Collected all time" value={money(collected)} hint="Paid invoices" />
        <Stat
          label="Appointments today"
          value={String(todays.length)}
          hint={
            lowStock.length > 0
              ? `${lowStock.length} part${lowStock.length === 1 ? '' : 's'} at reorder point`
              : 'Stock levels healthy'
          }
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Active work orders</h2>
            <button className="link" onClick={() => navigate('jobs')}>
              View all
            </button>
          </div>
          {active.length === 0 ? (
            <Empty title="No open work orders" text="Create one to start tracking a repair." />
          ) : (
            <ul className="rows">
              {active.slice(0, 6).map((job) => {
                const totals = jobTotals(job, state.taxRate);
                const meta = JOB_STATUS[job.status];
                return (
                  <li key={job.id}>
                    <button
                      className="row row-button"
                      onClick={() => navigate('jobs')}
                      aria-label={`Open work order #${job.number} for ${customerOf(job.customerId)?.name ?? 'customer'}`}
                    >
                      <span className="row-main">
                        <span className="row-title">
                          <span className="job-num">#{job.number}</span>{' '}
                          {customerOf(job.customerId)?.name ?? 'Customer'}
                        </span>
                        <span className="row-sub">
                          {vehicleName(vehicleOf(job.vehicleId))}
                          {job.technician ? ` · ${job.technician}` : ''}
                        </span>
                      </span>
                      <span className="row-side">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="amount">{money(totals.total)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Today's schedule</h2>
              <button className="link" onClick={() => navigate('schedule')}>
                Open
              </button>
            </div>
            {todays.length === 0 ? (
              <Empty title="Nothing booked" text="The bays are open all day." />
            ) : (
              <ul className="rows">
                {todays.map((appt) => (
                  <li key={appt.id} className="row">
                    <div className="row-main">
                      <span className="row-title">{appt.service}</span>
                      <span className="row-sub">
                        {customerOf(appt.customerId)?.name ?? 'Customer'} ·{' '}
                        {vehicleName(vehicleOf(appt.vehicleId))}
                      </span>
                    </div>
                    <div className="row-side">
                      <span className="time-pill">{prettyTime(appt.time)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Parts to reorder</h2>
              <button className="link" onClick={() => navigate('inventory')}>
                Inventory
              </button>
            </div>
            {lowStock.length === 0 ? (
              <Empty title="Stock levels fine" text="Nothing at its reorder point." />
            ) : (
              <ul className="rows">
                {lowStock.map((part) => (
                  <li key={part.id} className="row">
                    <div className="row-main">
                      <span className="row-title">{part.name}</span>
                      <span className="row-sub">{part.sku ?? 'No SKU'}</span>
                    </div>
                    <div className="row-side">
                      <Badge tone="red">{part.stock ?? 0} left</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
