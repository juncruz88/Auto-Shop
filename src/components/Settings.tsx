import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { useShop } from '../store';
import { CURRENCIES, formatMoney, plural } from '../lib/format';
import { readBackup, saveBackupFile, type RestorePreview } from '../lib/backup';
import {
  MAX_LOCAL_BACKUPS,
  getLocalBackup,
  listLocalBackups,
  saveLocalBackup,
  type LocalBackupSummary,
} from '../lib/localBackups';
import { Button, Field, Modal, PageHeader } from './ui';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const RELEASES_URL = 'https://github.com/juncruz88/Auto-Shop/releases/latest';

type AndroidAppBridge = { openReleases?: () => void };

function openReleases(event: MouseEvent<HTMLAnchorElement>) {
  const bridge = (window as Window & { AndroidApp?: AndroidAppBridge }).AndroidApp;
  if (!bridge?.openReleases) return;
  event.preventDefault();
  bridge.openReleases();
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function Settings() {
  const { state, dispatch } = useShop();
  const [shopName, setShopName] = useState(state.settings.shopName);
  const [currency, setCurrency] = useState(state.settings.currency);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<RestorePreview | null>(null);
  const [localBackups, setLocalBackups] = useState<LocalBackupSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const dirty =
    shopName.trim() !== state.settings.shopName || currency !== state.settings.currency;

  useEffect(() => {
    setShopName(state.settings.shopName);
    setCurrency(state.settings.currency);
  }, [state.settings.shopName, state.settings.currency]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  async function reloadLocalBackups() {
    try {
      setLocalBackups(await listLocalBackups());
    } catch {
      setLocalBackups([]);
    }
  }

  useEffect(() => {
    void reloadLocalBackups();
  }, []);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 6000);
  }

  function save() {
    const name = shopName.trim() || 'My Auto Shop';
    dispatch({ type: 'settings/save', settings: { shopName: name, currency } });
    setShopName(name);
    flash('Shop details saved.');
  }

  async function downloadBackup() {
    setError('');
    const result = await saveBackupFile(state);
    if (result === 'cancelled') return;
    flash(
      result === 'android'
        ? 'Choose a location — SD card, Downloads or cloud storage.'
        : result === 'saved'
          ? 'Backup saved.'
          : 'Backup downloaded.',
    );
  }

  async function chooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_BACKUP_BYTES) {
      setError('That backup is over 10 MB, which is too large to restore.');
      return;
    }
    try {
      setPending(readBackup(await file.text(), state.settings));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That backup could not be read.');
    }
  }

  async function snapshotCurrent() {
    try {
      await saveLocalBackup(state);
    } catch {
      // Snapshotting is best-effort; the main state still saves locally.
    }
  }

  async function restoreLocalBackup(backup: LocalBackupSummary) {
    setError('');
    try {
      const record = await getLocalBackup(backup.id);
      if (!record) {
        setError('That local backup is no longer available.');
        return;
      }
      if (
        !window.confirm(
          `Restore the local backup from ${formatSavedAt(backup.savedAt)}? Current shop data will be replaced.`,
        )
      ) {
        return;
      }
      await snapshotCurrent();
      const preview = readBackup(JSON.stringify(record.state), state.settings);
      dispatch({ type: 'data/import', state: preview.state });
      flash('Local backup restored.');
      await reloadLocalBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That local backup could not be restored.');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Shop settings"
        subtitle="The name, currency and backups used by this shop."
      />
      {notice ? (
        <p className="page-status" role="status">
          {notice}
        </p>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h2>Shop details</h2>
          <span className="muted">Saved on this device</span>
        </div>
        <div className="form-grid cols-2">
          <Field label="Shop name">
            <input
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              placeholder="Ridgeline Auto Service"
            />
          </Field>
          <Field label="Currency" hint={`Example: ${formatMoney(1234.5, currency)}`}>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="settings-actions">
          <Button onClick={save} disabled={!shopName.trim() || !dirty}>
            Save changes
          </Button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Backup & restore</h2>
          <span className="muted">JSON file</span>
        </div>
        <p className="muted settings-copy">
          A backup holds customers, vehicles, work orders, inventory, the schedule and shop
          settings. You choose where it is saved — on Android the system dialog can write to
          Downloads, an SD card or cloud storage — and the same file moves between the browser,
          the single-file app, iPhone and the Android app.
        </p>
        <div className="settings-actions">
          <Button onClick={downloadBackup}>Download backup</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Restore from file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="*/*"
            className="visually-hidden"
            onChange={chooseBackup}
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Local backups</h2>
          <span className="muted">Last {MAX_LOCAL_BACKUPS}</span>
        </div>
        <p className="muted settings-copy">
          Automatic snapshots are kept on this device. On Android, copies are also saved to
          Downloads/Ridgeline Auto Shop, so they survive clearing the app's data. Android 9 and
          older ask for storage access the first time. On the web, a full site-data clear removes
          them, so keep an exported JSON backup as well.
        </p>
        {localBackups.length === 0 ? (
          <p className="muted">No local snapshots yet. One is saved automatically as you work.</p>
        ) : (
          <ul className="local-backups">
            {localBackups.map((backup) => (
              <li className="local-backup" key={backup.id}>
                <div>
                  <strong>{formatSavedAt(backup.savedAt)}</strong>
                  <span>
                    {plural(backup.jobs, 'work order')} · {plural(backup.customers, 'customer')}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void restoreLocalBackup(backup)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>App updates</h2>
          <span className="muted">GitHub Releases</span>
        </div>
        <p className="muted settings-copy">
          Download the latest APK or standalone HTML from the newest GitHub Release.
        </p>
        <div className="settings-actions">
          <a
            className="btn btn-secondary"
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={openReleases}
          >
            Check for updates
          </a>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Maintenance</h2>
        </div>
        <p className="muted settings-copy">
          Reset replaces customers, vehicles, work orders, inventory and appointments with the demo
          set. Your shop name and currency are kept.
        </p>
        <div className="settings-actions">
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Reset all shop data back to the demo set?')) return;
              await snapshotCurrent();
              dispatch({ type: 'reset' });
              flash('Demo data restored.');
              await reloadLocalBackups();
            }}
          >
            Reset demo data
          </Button>
          <span className="muted">A local snapshot is saved first.</span>
        </div>
      </section>

      {pending ? (
        <Modal
          title="Restore this backup?"
          subtitle="The current shop data will be replaced."
          onClose={() => setPending(null)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await snapshotCurrent();
                  dispatch({ type: 'data/import', state: pending.state });
                  setPending(null);
                  flash('Backup restored.');
                  await reloadLocalBackups();
                }}
              >
                Replace data
              </Button>
            </>
          }
        >
          <div className="backup-summary">
            <div>
              <span className="cell-sub">Shop</span>
              <strong>{pending.state.settings.shopName}</strong>
            </div>
            <div>
              <span className="cell-sub">Currency</span>
              <strong>{pending.state.settings.currency}</strong>
            </div>
          </div>
          <ul className="backup-counts">
            <li>{plural(pending.state.customers.length, 'customer')}</li>
            <li>{plural(pending.state.vehicles.length, 'vehicle')}</li>
            <li>{plural(pending.state.jobs.length, 'work order')}</li>
            <li>
              {plural(
                pending.state.items.filter((item) => item.kind === 'part').length,
                'part',
              )}
            </li>
            <li>{plural(pending.state.appointments.length, 'appointment')}</li>
          </ul>
          {pending.notes.length > 0 ? (
            <div className="backup-notes" role="status">
              <strong>Some entries were repaired or skipped</strong>
              <ul>
                {pending.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="muted">Its shop name and currency are applied too.</p>
        </Modal>
      ) : null}
    </div>
  );
}
