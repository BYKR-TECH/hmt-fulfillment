'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function WixRefreshButton() {
  const router = useRouter();
  const [state, setState] = useState({ running: false, message: '' });
  const runningRef = useRef(false);

  async function refreshWixOrders() {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ running: true, message: '' });

    try {
      const response = await fetch('/api/integrations/wix/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual-refresh', force: true })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Wix sync failed.');
      }
      const result = await response.json();
      if (result.ok === false) throw new Error(result.error || 'Wix sync failed.');
      router.refresh();
      setState({
        running: false,
        message: result.skipped ? 'Skipped' : `Updated ${result.persisted ?? 0}`
      });
    } catch (error) {
      setState({ running: false, message: error.message || 'Refresh failed' });
    } finally {
      runningRef.current = false;
    }
  }

  return (
    <div className="sidebarSync">
      <button type="button" className="secondary" onClick={refreshWixOrders} disabled={state.running}>
        <RefreshCw size={16} aria-hidden="true" />
        <span>{state.running ? 'Refreshing...' : 'Refresh Wix orders'}</span>
      </button>
      {state.message ? <span className="sidebarSyncStatus">{state.message}</span> : null}
    </div>
  );
}
