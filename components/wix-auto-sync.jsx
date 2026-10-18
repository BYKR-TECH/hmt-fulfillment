'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'hmt:last-wix-auto-sync';

export function WixAutoSync() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WIX_AUTO_SYNC_ON_OPEN === 'false') return;
    const minIntervalMs = Math.max(Number(process.env.NEXT_PUBLIC_WIX_AUTO_SYNC_MIN_INTERVAL_SECONDS || 120), 15) * 1000;
    const lastRun = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
    if (lastRun && Date.now() - lastRun < minIntervalMs) return;
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));

    const body = new Blob([JSON.stringify({ reason: 'crm-open' })], { type: 'application/json' });
    if (!navigator.sendBeacon('/api/integrations/wix/sync', body)) window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return null;
}
