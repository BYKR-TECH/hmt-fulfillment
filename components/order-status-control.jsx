'use client';

import { useState } from 'react';
import { ORDER_STATUSES, STATUS_FILTERS } from '@/lib/crm/constants';

const STATUS_LABELS = Object.fromEntries(STATUS_FILTERS);

export function OrderStatusControl({ order }) {
  const [status, setStatus] = useState(order.internal_status || 'new');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function saveStatus(nextStatus) {
    if (nextStatus === order.internal_status) {
      setMessage('This order already has that status.');
      return;
    }
    if (nextStatus === 'cancelled' && !window.confirm('Mark this order cancelled in Ops? This will not cancel an active courier shipment.')) return;

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/crm/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_status: nextStatus,
          change_notes: note.trim() || `Operator changed order status to ${statusLabel(nextStatus)}`
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Status update failed.');
      window.location.reload();
    } catch (error) {
      setMessage(error.message || 'Status update failed.');
      setSaving(false);
    }
  }

  return (
    <section className="panel orderStatusControl" aria-labelledby="order-status-heading">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Order workflow</p>
          <h2 id="order-status-heading">Update order status</h2>
        </div>
        <div className="statusQuickActions">
          <button type="button" className="secondary" disabled={saving || order.internal_status === 'fulfilled'} onClick={() => saveStatus('fulfilled')}>Mark fulfilled</button>
          <button type="button" className="danger" disabled={saving || order.internal_status === 'cancelled'} onClick={() => saveStatus('cancelled')}>Mark cancelled</button>
        </div>
      </div>
      <div className="panelBody orderStatusFields">
        <label>
          <span>Status</span>
          <select value={status} onChange={event => setStatus(event.target.value)} disabled={saving}>
            {ORDER_STATUSES.map(option => <option value={option} key={option}>{statusLabel(option)}</option>)}
          </select>
        </label>
        <label className="statusNote">
          <span>Reason / note (optional)</span>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="Why is this status changing?" disabled={saving} />
        </label>
        <button type="button" onClick={() => saveStatus(status)} disabled={saving || status === order.internal_status}>{saving ? 'Updating…' : 'Update status'}</button>
        {message ? <span className="dangerText" role="alert">{message}</span> : null}
        <small className="muted full">This changes the Ops status and audit trail only. Courier cancellation and Wix fulfillment remain separate actions.</small>
      </div>
    </section>
  );
}

function statusLabel(status) {
  return STATUS_LABELS[status] || String(status).replaceAll('_', ' ');
}
