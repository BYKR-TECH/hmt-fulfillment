'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FulfillShipmentButton } from './fulfill-shipment-button';
import { StatusPill } from './status-pill';
import { defaultPickupWindow } from '@/lib/crm/pickup-window';
import { TableHead } from './table-head';

const INDIA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

function carrierLabel(carrier = '') {
  const value = String(carrier || 'unknown').trim();
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function wixBadge(shipment) {
  const fulfillment = String(shipment.fulfillment_status || '').toUpperCase();
  const wixStatus = String(shipment.wix_fulfillment_status || '').toLowerCase();
  if (wixStatus === 'failed') return { label: 'Wix sync failed', tone: 'danger' };
  if (fulfillment === 'FULFILLED' || wixStatus === 'fulfilled' || wixStatus === 'synced') {
    return { label: 'Wix fulfilled', tone: 'ok' };
  }
  if (wixStatus.includes('awaiting') || wixStatus.includes('pending')) {
    return { label: 'Wix awaiting pickup', tone: 'warn' };
  }
  return { label: 'Wix not fulfilled', tone: 'muted' };
}

export function PickupWorkspace({ workspace }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const refreshLock = useRef(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const { needsPickup = [], pickedUp = [], exceptions = [], updatedAt } = workspace || {};
  const awaitingCount = needsPickup.reduce((total, group) => total + group.shipments.length, 0);

  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    setRefreshMessage('');
    try {
      const response = await fetch('/api/crm/pickups/refresh', { method: 'POST' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setRefreshMessage(result.tracking?.lastError || 'Live tracking refresh failed.');
        return;
      }
      const result = await response.json();
      setRefreshMessage(`Live status updated for ${result.tracking?.lastPolled || 0} shipments.`);
      router.refresh();
    } catch {
      setRefreshMessage('Could not refresh live carrier status.');
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }

  return (
    <>
      <section className="pickupHero panel">
        <div>
          <p className="eyebrow">Warehouse pickup queue</p>
          <h2>
            {awaitingCount} awaiting pickup · {pickedUp.length} picked up
          </h2>
          <p className="muted">
            Last carrier update: {updatedAt ? formatDateTime(updatedAt) : 'Not available yet'}.
            Delhivery + FedEx (and any other AWB) appear here when booked but not yet collected.
          </p>
          <p className="muted">Live carrier progress updates this queue automatically. Historical Wix-fulfilled shipments are also treated as completed.</p>
        </div>
        <div className="toolbar">
          <button type="button" className="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? (
              <>
                <span className="buttonSpinner" aria-hidden="true" />
                Refreshing live status…
              </>
            ) : (
              'Refresh live AWB status'
            )}
          </button>
        </div>
      </section>
      {refreshMessage ? (
        <p className={refreshMessage.includes('failed') || refreshMessage.includes('Could not') ? 'dangerText' : 'muted'}>
          {refreshMessage}
        </p>
      ) : null}
      <section className="pickupSection">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Action required</p>
            <h2>Needs pickup</h2>
            <p className="muted">
              Booked shipments grouped by warehouse and carrier. Mark picked up after collection to send tracking and fulfill the order on Wix.
            </p>
          </div>
        </div>
        <PickupLocationGroups groups={needsPickup} />
      </section>
      <ShipmentStatusSection
        title="Already picked up"
        description="Carrier has confirmed pickup or moved the shipment into a later delivery stage."
        shipments={pickedUp}
        empty="No shipments have been confirmed picked up yet."
      />
      <ShipmentStatusSection
        title="Pickup exceptions"
        description="Investigate failed pickup, cancellation, or return statuses before creating another request."
        shipments={exceptions}
        empty="No pickup exceptions."
        danger
      />
    </>
  );
}

export function PickupLocationGroups({ groups = [] }) {
  return (
    <div className="pickupLocationGroups">
      {groups.map(group => (
        <PickupLocationGroup group={group} key={group.key || `${group.location}-${group.carrier}`} />
      ))}
      {!groups.length ? <p className="empty">No booked shipments are waiting for warehouse pickup.</p> : null}
    </div>
  );
}

function PickupLocationGroup({ group }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isDelhivery = String(group.carrier || '').toLowerCase() === 'delhivery';
  const canRequest = isDelhivery && group.location !== 'Unassigned pickup location';

  async function requestPickup() {
    if (busy) return;
    const defaults = defaultPickupWindow();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/crm/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_location: group.location,
          pickup_date: defaults.date,
          pickup_time: defaults.time
        })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error || 'Pickup request could not be completed.');
        return;
      }
      const result = await response.json();
      setMessage(result.message || 'Pickup request finished.');
      router.refresh();
    } catch {
      setMessage('Pickup request could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel pickupLocationGroup">
      <div className="panelHeader">
        <div>
          <h2>
            {group.location} · {carrierLabel(group.carrier)}
          </h2>
          <p className="muted">
            {group.shipments.length} awaiting
            {isDelhivery ? ` · ${group.requestableCount} ready to request · ${group.requestedCount} request pending` : ' · tracking / mark pickup only'}
          </p>
        </div>
        {canRequest && group.requestableCount ? (
          <button type="button" onClick={requestPickup} disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <span className="buttonSpinner" aria-hidden="true" />
                Raising pickup…
              </>
            ) : (
              `Request pickup (${group.requestableCount})`
            )}
          </button>
        ) : null}
      </div>
      <div className="tableWrap">
        <table>
          <TableHead columns={['Order', 'Customer', 'Carrier', 'AWB', 'Warehouse', 'Waiting', 'Wix', 'Status', 'Links']} />
          <tbody>
            {group.shipments.map(shipment => (
              <PickupShipmentRow key={shipment.id} shipment={shipment} showMarkPickup onDone={() => router.refresh()} />
            ))}
          </tbody>
        </table>
      </div>
      {message ? (
        <p className={String(message).toLowerCase().includes('fail') || String(message).toLowerCase().includes('could not') ? 'dangerText' : 'muted'}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

function PickupShipmentRow({ shipment, showMarkPickup = false, onDone }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const badge = wixBadge(shipment);

  async function markPickedUp() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/crm/orders/${shipment.order_id}/shipments/${shipment.id}/mark-picked-up`, {
        method: 'POST'
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error || 'Could not mark picked up.');
        return;
      }
      const result = await response.json();
      setMessage(result.message || 'Mark picked up finished.');
      onDone?.();
    } catch {
      setMessage('Could not mark picked up.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <Link href={`/orders/${shipment.order_id}`}>
          <strong>{shipment.order_number || 'Open order'}</strong>
        </Link>
      </td>
      <td>
        <span>{shipment.customer_name || '-'}</span>
        {shipment.customer_phone ? <span className="subtle">{shipment.customer_phone}</span> : null}
      </td>
      <td>{carrierLabel(shipment.courier_code)}</td>
      <td>
        <strong>{shipment.waybill}</strong>
      </td>
      <td>{shipment.pickup_location || '-'}</td>
      <td>
        {shipment.days_waiting == null ? '-' : `${shipment.days_waiting}d`}
        {shipment.booked_at ? <span className="subtle">{formatDateTime(shipment.booked_at)}</span> : null}
      </td>
      <td>
        <span className={`pill ${badge.tone === 'ok' ? 'ok' : badge.tone === 'danger' ? 'danger' : ''}`}>{badge.label}</span>
      </td>
      <td>
        <StatusPill value={shipment.status} />
      </td>
      <td>
        <div className="toolbar" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
          <Link href={`/orders/${shipment.order_id}`}>Order</Link>
          {shipment.tracking_url ? (
            <a href={shipment.tracking_url} target="_blank" rel="noreferrer">
              Track
            </a>
          ) : null}
          {showMarkPickup ? (
            <button type="button" className="secondary" onClick={markPickedUp} disabled={busy} title="Record courier pickup and fulfill this order on Wix with tracking.">
              {busy ? 'Syncing…' : 'Mark picked up'}
            </button>
          ) : null}
        </div>
        {message ? <p className="subtle">{message}</p> : null}
      </td>
    </tr>
  );
}

function ShipmentStatusSection({ title, description, shipments = [], empty, danger = false }) {
  return (
    <section className="panel pickupStatusSection">
      <div className="panelHeader">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className={danger ? 'pill danger' : 'pill ok'}>{shipments.length}</span>
      </div>
      {shipments.length ? (
        <div className="tableWrap">
          <table>
            <TableHead columns={['Order', 'Customer', 'Carrier', 'AWB', 'Warehouse', 'Live status', 'Wix', 'Last update', 'Links']} />
            <tbody>
              {shipments.map(shipment => {
                const badge = wixBadge(shipment);
                return (
                  <tr key={shipment.id}>
                    <td>
                      <Link href={`/orders/${shipment.order_id}`}>
                        <strong>{shipment.order_number || 'Open order'}</strong>
                      </Link>
                    </td>
                    <td>
                      <span>{shipment.customer_name || '-'}</span>
                      {shipment.customer_phone ? <span className="subtle">{shipment.customer_phone}</span> : null}
                    </td>
                    <td>{carrierLabel(shipment.courier_code)}</td>
                    <td>
                      <strong>{shipment.waybill}</strong>
                    </td>
                    <td>{shipment.pickup_location || '-'}</td>
                    <td>
                      <StatusPill value={shipment.status} />
                    </td>
                    <td>
                      <span className={`pill ${badge.tone === 'ok' ? 'ok' : badge.tone === 'danger' ? 'danger' : ''}`}>{badge.label}</span>
                    </td>
                    <td>{shipment.updated_at ? formatDateTime(shipment.updated_at) : '-'}</td>
                    <td>
                      <div className="toolbar" style={{ gap: '0.35rem' }}>
                        <Link href={`/orders/${shipment.order_id}`}>Order</Link>
                        {shipment.orders?.wix_order_id && badge.tone !== 'ok' && !danger ? <FulfillShipmentButton orderId={shipment.order_id} shipment={shipment} /> : null}
                        {shipment.tracking_url ? (
                          <a href={shipment.tracking_url} target="_blank" rel="noreferrer">
                            Track
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">{empty}</p>
      )}
    </section>
  );
}

function formatDateTime(value) {
  return INDIA_DATE_TIME_FORMATTER.format(new Date(value));
}
