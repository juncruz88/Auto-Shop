import { useState } from 'react';
import { useShop } from '../store';
import type { Job, JobStatus } from '../types';
import {
  JOB_STATUS,
  JOB_STATUS_ORDER,
  jobTotals,
  prettyDate,
  today,
  vehicleName,
} from '../lib/format';
import { Badge, Button, Empty, PageHeader } from './ui';
import JobModal from './JobModal';

export default function Jobs() {
  const { state, dispatch, money } = useShop();
  const [filter, setFilter] = useState<'all' | JobStatus>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Job | null>(null);
  const [creating, setCreating] = useState(false);

  const search = query.trim().toLowerCase();
  const jobs = [...state.jobs]
    .sort((a, b) => b.number - a.number)
    .filter((job) => (filter === 'all' ? true : job.status === filter))
    .filter((job) => {
      if (!search) return true;
      const customer = state.customers.find((c) => c.id === job.customerId)?.name ?? '';
      const vehicle = vehicleName(state.vehicles.find((v) => v.id === job.vehicleId));
      return `${job.number} ${customer} ${vehicle} ${job.technician}`.toLowerCase().includes(search);
    });

  const countFor = (status: JobStatus) =>
    state.jobs.filter((job) => job.status === status).length;

  return (
    <div className="page">
      <PageHeader
        title="Work orders"
        subtitle={`${state.jobs.length} total · ${state.jobs.filter((j) => j.status !== 'completed').length} open`}
        actions={
          <>
            <input
              className="search"
              placeholder="Search job, customer or vehicle…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button onClick={() => setCreating(true)}>New work order</Button>
          </>
        }
      />

      <div className="chips">
        <button
          className={`chip${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All <span className="count">{state.jobs.length}</span>
        </button>
        {JOB_STATUS_ORDER.map((status) => (
          <button
            key={status}
            className={`chip${filter === status ? ' active' : ''}`}
            onClick={() => setFilter(status)}
          >
            {JOB_STATUS[status].label} <span className="count">{countFor(status)}</span>
          </button>
        ))}
      </div>

      <section className="card">
        {jobs.length === 0 ? (
          <Empty
            title="No work orders here"
            text="Change the filter or start a new work order for a customer."
          />
        ) : (
          <>
            <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer & vehicle</th>
                  <th>Status</th>
                  <th className="hide-sm">Technician</th>
                  <th>Promised</th>
                  <th className="right">Total</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const meta = JOB_STATUS[job.status];
                  const totals = jobTotals(job, state.taxRate);
                  const customer = state.customers.find((c) => c.id === job.customerId);
                  const vehicle = state.vehicles.find((v) => v.id === job.vehicleId);
                  const overdue = job.status !== 'completed' && job.promisedAt < today();
                  return (
                    <tr key={job.id}>
                      <td>
                        <span className="cell-title job-num">#{job.number}</span>
                        <span className="cell-sub">{job.items.length} line items</span>
                      </td>
                      <td>
                        <span className="cell-title">{customer?.name ?? 'Customer'}</span>
                        <span className="cell-sub">
                          {vehicleName(vehicle)}
                          {vehicle?.plate ? ` · ${vehicle.plate}` : ''}
                        </span>
                      </td>
                      <td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {job.status === 'completed' ? (
                          <span className={`paid-flag ${job.paid ? 'paid' : ''}`}>
                            {job.paid ? 'Paid' : 'Unpaid'}
                          </span>
                        ) : null}
                      </td>
                      <td className="hide-sm">
                        {job.technician || <span className="muted">Unassigned</span>}
                      </td>
                      <td>
                        <span className={overdue ? 'overdue' : undefined}>
                          {prettyDate(job.promisedAt)}
                        </span>
                      </td>
                      <td className="right amount">{money(totals.total)}</td>
                      <td className="right">
                        <div className="actions">
                          {meta.next ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                dispatch({
                                  type: 'job/setStatus',
                                  id: job.id,
                                  status: meta.next as JobStatus,
                                })
                              }
                            >
                              {meta.action}
                            </Button>
                          ) : null}
                          {job.status === 'completed' && !job.paid ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => dispatch({ type: 'job/togglePaid', id: job.id })}
                            >
                              Mark paid
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(job)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Delete work order #${job.number}?`)) {
                                dispatch({ type: 'job/delete', id: job.id });
                              }
                            }}
                          >
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
              {jobs.map((job) => {
                const meta = JOB_STATUS[job.status];
                const totals = jobTotals(job, state.taxRate);
                const customer = state.customers.find((c) => c.id === job.customerId);
                const vehicle = state.vehicles.find((v) => v.id === job.vehicleId);
                const overdue = job.status !== 'completed' && job.promisedAt < today();
                return (
                  <article className="job-card" key={job.id}>
                    <div className="job-card-top">
                      <span className="job-num">#{job.number}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {job.status === 'completed' ? (
                        <span className={`paid-flag ${job.paid ? 'paid' : ''}`}>
                          {job.paid ? 'Paid' : 'Unpaid'}
                        </span>
                      ) : null}
                      <span className="amount">{money(totals.total)}</span>
                    </div>
                    <div className="job-card-main">
                      <span className="row-title">{customer?.name ?? 'Customer'}</span>
                      <span className="row-sub">
                        {vehicleName(vehicle)}
                        {vehicle?.plate ? ` · ${vehicle.plate}` : ''}
                        {job.technician ? ` · ${job.technician}` : ''}
                      </span>
                      <span className={`row-sub${overdue ? ' overdue' : ''}`}>
                        Promised {prettyDate(job.promisedAt)}
                      </span>
                    </div>
                    <div className="job-card-actions">
                      {meta.next ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            dispatch({
                              type: 'job/setStatus',
                              id: job.id,
                              status: meta.next as JobStatus,
                            })
                          }
                        >
                          {meta.action}
                        </Button>
                      ) : null}
                      {job.status === 'completed' && !job.paid ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => dispatch({ type: 'job/togglePaid', id: job.id })}
                        >
                          Mark paid
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(job)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Delete work order #${job.number}?`)) {
                            dispatch({ type: 'job/delete', id: job.id });
                          }
                        }}
                      >
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

      {creating || editing ? (
        <JobModal
          job={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
