import { useEffect, useState } from 'react';
import { ShopProvider, useShop } from './store';
import type { TabId } from './types';
import Sidebar from './components/Sidebar';
import InstallApp from './components/InstallApp';
import Dashboard from './components/Dashboard';
import Jobs from './components/Jobs';
import Customers from './components/Customers';
import Inventory from './components/Inventory';
import Schedule from './components/Schedule';
import Settings from './components/Settings';

function Shell() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const { state, startupNotice, dismissStartupNotice } = useShop();

  useEffect(() => {
    document.title = `${state.settings.shopName} — Shop Manager`;
  }, [state.settings.shopName]);

  return (
    <div className="app">
      <Sidebar tab={tab} onChange={setTab} />
      <main className="main">
        {startupNotice ? (
          <div
            className={`startup-notice ${startupNotice.tone}`}
            role={startupNotice.tone === 'warning' ? 'alert' : 'status'}
          >
            <span>{startupNotice.message}</span>
            <button
              type="button"
              className="startup-notice-dismiss"
              onClick={dismissStartupNotice}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {tab === 'dashboard' ? <Dashboard navigate={setTab} /> : null}
        {tab === 'jobs' ? <Jobs /> : null}
        {tab === 'customers' ? <Customers /> : null}
        {tab === 'inventory' ? <Inventory /> : null}
        {tab === 'schedule' ? <Schedule /> : null}
        {tab === 'settings' ? <Settings /> : null}
      </main>
      <InstallApp />
    </div>
  );
}

export default function App() {
  return (
    <ShopProvider>
      <Shell />
    </ShopProvider>
  );
}
