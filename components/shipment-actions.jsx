'use client';

import { useState } from 'react';
import { FulfillShipmentButton } from './fulfill-shipment-button';
import { PrintLabelButton } from './print-label-button';
import { defaultPickupWindow } from '@/lib/crm/pickup-window';
import { canCancelShiprocket } from '@/lib/crm/shiprocket-cancellation.js';

export function ShipmentActions({ orderId, shipment }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const capabilities = shipmentActionCapabilities(shipment);


  async function cancel() {
    if (!window.confirm(`Cancel ${shipment.courier_code} shipment ${shipment.waybill || shipment.order_number}? This cannot be undone.`)) return;
    await runMutation(`/api/crm/orders/${orderId}/shipments/${shipment.id}/cancel`, {}, 'Cancellation request finished.', true);
  }

  async function raisePickup() {
    const defaults = defaultPickupWindow();
    await runMutation(`/api/crm/orders/${orderId}/shipments/${shipment.id}/pickup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup_date: defaults.date, pickup_time: defaults.time, pickup_location: shipment.pickup_location, expected_package_count: 1 })
    }, 'Pickup request finished.', true);
  }

  async function sendWhatsApp() {
    if (!window.confirm(`Send the shipment confirmation for AWB ${shipment.waybill} on WhatsApp?`)) return;
    await runMutation(`/api/crm/orders/${orderId}/shipments/${shipment.id}/send-shipment-confirmation`, { method: 'POST' }, 'WhatsApp request finished.');
  }

  async function runMutation(url, options, fallback, reload = false) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error || fallback);
        return;
      }
      const result = await response.json();
      setMessage(result.message || fallback);
      if (reload) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return <ShipmentActionButtons orderId={orderId} shipment={shipment} capabilities={capabilities} busy={busy} message={message} onCancel={cancel} onPickup={raisePickup} onWhatsApp={sendWhatsApp} />;
}

function ShipmentActionButtons({ orderId, shipment, capabilities, busy, message, onCancel, onPickup, onWhatsApp }) {
  return <div className="shipmentActions"><FulfillShipmentButton orderId={orderId} shipment={shipment} />{capabilities.print ? <PrintLabelButton shipmentId={shipment.id} /> : null}{capabilities.whatsApp ? <button type="button" className="button secondary" onClick={onWhatsApp} disabled={busy}>{busy ? 'Sending…' : 'Send WhatsApp update'}</button> : null}{capabilities.pickup ? <button type="button" className="button secondary" onClick={onPickup} disabled={busy}>{busy ? 'Raising…' : 'Raise pickup'}</button> : null}{capabilities.cancel ? <button type="button" className="button danger" onClick={onCancel} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel'}</button> : null}{message ? <small>{message}</small> : null}</div>;
}

function shipmentActionCapabilities(shipment) {
  const status = String(shipment.status || '').toLowerCase();
  const print = Boolean(shipment.id && shipment.waybill && String(shipment.courier_code || 'delhivery').toLowerCase() === 'delhivery');
  return {
    cancel: canCancelShiprocket(shipment) || Boolean(shipment.waybill && String(shipment.courier_code || '').toLowerCase() === 'delhivery' && !['delivered', 'cancelled', 'returned', 'rto', 'rto_in_transit', 'rto_delivered'].includes(status)),
    print,
    pickup: print && shipment.direction !== 'reverse' && !status.startsWith('rto') && !['pickup_pending', 'picked-up', 'picked_up', 'dispatched', 'in-transit', 'in_transit', 'out-for-delivery', 'out_for_delivery', 'delivered', 'cancelled', 'canceled', 'returned', 'rto'].includes(status),
    whatsApp: Boolean(shipment.id && shipment.waybill && shipment.direction !== 'reverse' && !status.startsWith('rto') && !['cancelled', 'canceled', 'returned', 'rto', 'failed', 'pending', 'pending-zone', 'pending-international'].includes(status))
  };
}
