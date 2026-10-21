'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StatusUndoButton({ orderId, lastChange = null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function undo() {
    const action = lastChange?.action || lastChange?.event_type || 'last status change';
    const from = lastChange?.from || '';
    const to = lastChange?.to || '';
    const summary = from && to ? `${from} → ${to}` : String(action).replaceAll('_', ' ');
    const reason = window.prompt(
      `Undo ${summary}?\n\nThis reverts Ops fields only.\nWix fulfillments and already-sent WhatsApp cannot be recalled.\n\nEnter a reason (required):`,
      'Accidental status change'
    );
    if (reason == null) return;
    if (!String(reason).trim()) {
      setMessage('A reason is required to undo.');
      return;
    }
    const clearDedupe = window.confirm(
      'Also clear the WhatsApp shipment-confirmation dedupe for this AWB so a future real pickup can notify the customer again?\n\nOK = clear dedupe (recommended for accidental Mark picked up)\nCancel = keep dedupe (future pickup WhatsApp stays blocked)'
    );

    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/crm/orders/${orderId}/undo-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmBackward: true,
          reason: String(reason).trim(),
          clearWhatsAppDedupe: clearDedupe
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        setMessage(result.error || 'Undo failed.');
        return;
      }
      const notes = (result.warnings || []).join(' ');
      setMessage(result.message || (notes ? `Reverted. ${notes}` : 'Reverted.'));
      router.refresh();
    } catch {
      setMessage('Undo failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="toolbar" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
      <button type="button" className="button secondary" onClick={undo} disabled={busy} title="Revert the last operator status change on this order (Ops fields only).">
        {busy ? 'Undoing…' : 'Undo last status change'}
      </button>
      {message ? <small className="muted">{message}</small> : null}
    </div>
  );
}
