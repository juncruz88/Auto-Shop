import { useState } from 'react';
import { useShop } from '../store';
import type { CatalogItem } from '../types';
import { uid } from '../lib/format';
import { Badge, Button, Empty, Field, Modal, PageHeader } from './ui';
import ScanModal from './ScanModal';

const blankItem = (kind: 'labor' | 'part'): CatalogItem => ({
  id: '',
  kind,
  name: '',
  price: 0,
  sku: '',
  stock: kind === 'part' ? 0 : undefined,
  reorderAt: kind === 'part' ? 2 : undefined,
});

export default function Inventory() {
  const { state, dispatch, money } = useShop();
  const [draft, setDraft] = useState<CatalogItem | null>(null);
  const [scanning, setScanning] = useState(false);

  const labor = state.items.filter((item) => item.kind === 'labor');
  const parts = state.items.filter((item) => item.kind === 'part');
  const lowStock = parts.filter((part) => (part.stock ?? 0) <= (part.reorderAt ?? 0));

  function save() {
    if (!draft || !draft.name.trim()) return;
    const item: CatalogItem = {
      ...draft,
      id: draft.id || uid(),
      name: draft.name.trim(),
      price: Math.max(0, Number(draft.price) || 0),
      ...(draft.kind === 'part'
        ? { stock: Math.max(0, Number(draft.stock) || 0), reorderAt: Math.max(0, Number(draft.reorderAt) || 0) }
        : { stock: undefined, reorderAt: undefined, sku: undefined }),
    };
    dispatch({ type: 'item/save', item });
    setDraft(null);
  }

  return (
    <div className="page">
      <PageHeader
        title="Inventory"
        subtitle={`${labor.length} services · ${parts.length} parts on the shelf`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setScanning(true)}>
              Scan part
            </Button>
            <Button variant="secondary" onClick={() => setDraft(blankItem('part'))}>
              Add part
            </Button>
            <Button onClick={() => setDraft(blankItem('labor'))}>Add service</Button>
          </>
        }
      />

      {lowStock.length > 0 ? (
        <div className="banner">
          <strong>Reorder soon:</strong> {lowStock.map((part) => part.name).join(', ')} at or below
          the reorder point.
        </div>
      ) : null}

      <div className="grid-2 even">
        <section className="card">
          <div className="card-head">
            <h2>Labor & services</h2>
            <span className="muted">Billable by the job</span>
          </div>
          {labor.length === 0 ? (
            <Empty title="No services yet" text="Add your first service to the catalog." />
          ) : (
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th className="right">Price</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {labor.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className="right amount">{money(item.price)}</td>
                      <td className="right">
                        <div className="actions">
                          <Button variant="ghost" size="sm" onClick={() => setDraft({ ...item })}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Delete ${item.name} from the catalog?`)) {
                                dispatch({ type: 'item/delete', id: item.id });
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Parts</h2>
            <span className="muted">Stock updates as jobs use parts</span>
          </div>
          {parts.length === 0 ? (
            <Empty title="No parts yet" text="Add parts to track stock levels." />
          ) : (
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="right">Price</th>
                    <th className="center">Stock</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => {
                    const low = (part.stock ?? 0) <= (part.reorderAt ?? 0);
                    return (
                      <tr key={part.id}>
                        <td>
                          <span className="cell-title">{part.name}</span>
                          <span className="cell-sub">{part.sku || 'No SKU'}</span>
                        </td>
                        <td className="right amount">{money(part.price)}</td>
                        <td className="center">
                          <div className="stock-cell">
                            <button
                              className="step-btn"
                              onClick={() =>
                                dispatch({ type: 'item/adjustStock', id: part.id, delta: -1 })
                              }
                              aria-label={`Use one ${part.name}`}
                            >
                              −
                            </button>
                            <span className={low ? 'stock-low' : undefined}>{part.stock ?? 0}</span>
                            <button
                              className="step-btn"
                              onClick={() =>
                                dispatch({ type: 'item/adjustStock', id: part.id, delta: 1 })
                              }
                              aria-label={`Receive one ${part.name}`}
                            >
                              +
                            </button>
                          </div>
                          {low ? <Badge tone="red">Reorder</Badge> : null}
                        </td>
                        <td className="right">
                          <div className="actions">
                            <Button variant="ghost" size="sm" onClick={() => setDraft({ ...part })}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`Delete ${part.name} from inventory?`)) {
                                  dispatch({ type: 'item/delete', id: part.id });
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
          )}
        </section>
      </div>

      {draft ? (
        <Modal
          title={draft.id ? 'Edit catalog item' : draft.kind === 'part' ? 'New part' : 'New service'}
          onClose={() => setDraft(null)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!draft.name.trim()}>
                Save
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Type">
              <select
                value={draft.kind}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: event.target.value as 'labor' | 'part',
                    stock: event.target.value === 'part' ? draft.stock ?? 0 : undefined,
                    reorderAt: event.target.value === 'part' ? draft.reorderAt ?? 2 : undefined,
                  })
                }
              >
                <option value="labor">Service (labor)</option>
                <option value="part">Part</option>
              </select>
            </Field>
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={draft.kind === 'part' ? 'Brake rotor' : 'Brake inspection'}
                autoFocus
              />
            </Field>
            <Field label="Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })}
              />
            </Field>
            {draft.kind === 'part' ? (
              <>
                <Field label="SKU">
                  <input
                    value={draft.sku ?? ''}
                    onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                    placeholder="BR-440"
                  />
                </Field>
                <div className="form-grid cols-2">
                  <Field label="In stock">
                    <input
                      type="number"
                      min="0"
                      value={draft.stock ?? 0}
                      onChange={(event) =>
                        setDraft({ ...draft, stock: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Reorder at">
                    <input
                      type="number"
                      min="0"
                      value={draft.reorderAt ?? 0}
                      onChange={(event) =>
                        setDraft({ ...draft, reorderAt: Number(event.target.value) })
                      }
                    />
                  </Field>
                </div>
              </>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {scanning ? (
        <ScanModal
          onClose={() => setScanning(false)}
          onCreate={(code) => setDraft({ ...blankItem('part'), sku: code })}
        />
      ) : null}
    </div>
  );
}
