'use client';

import { useState } from 'react';
import { FulfillShipmentButton } from './fulfill-shipment-button';
import { PrintLabelButton } from './print-label-button';
import { defaultPickupWindow } from './pickup-location-groups';
import { canCancelShiprocket } from '@/lib/crm/shiprocket-cancellation.js';

export function ShipmentActions({ orderId, shipment }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const status = String(shipment.status || '').toLowerCase();
  const canCancel = canCancelShiprocket(shipment) || (shipment.waybill && String(shipment.courier_code || '').toLowerCase() === 'delhivery' && !['delivered', 'cancelled', 'returned', 'rto', 'rto_in_transit', 'rto_delivered'].includes(status));
  const canPrint = Boolean(shipment.id && shipment.waybill && String(shipment.courier_code || 'delhivery').toLowerCase() === 'delhivery');
  const canRaisePickup = canPrint && shipment.direction !== 'reverse' && !status.startsWith('rto') && !['pickup_pending', 'picked-up', 'picked_up', 'dispatched', 'in-transit', 'in_transit', 'out-for-delivery', 'out_for_delivery', 'delivered', 'cancelled', 'canceled', 'returned', 'rto'].includes(status);
  const canSendWhatsApp = Boolean(shipment.id && shipment.waybill && shipment.direction !== 'reverse' && !status.startsWith('rto') && !['cancelled', 'canceled', 'returned', 'rto', 'failed', 'pending', 'pending-zone', 'pending-international'].includes(status));


  async function cancel() {
    if (!window.confirm(`Cancel ${shipment.courier_code} shipment ${shipment.waybill || shipment.order_number}? This cannot be undone.`)) return;
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/crm/orders/${orderId}/shipments/${shipment.id}/cancel`, { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(result.message || result.error || 'Cancellation request finished.');
    if (result.ok) window.location.reload();
  }

  async function raisePickup() {
    const defaults = defaultPickupWindow();
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/crm/orders/${orderId}/shipments/${shipment.id}/pickup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup_date: defaults.date, pickup_time: defaults.time, pickup_location: shipment.pickup_location, expected_package_count: 1 })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(result.message || result.error || 'Pickup request finished.');
    if (result.ok) window.location.reload();
  }

  async function sendWhatsApp() {
    if (!window.confirm(`Send the shipment confirmation for AWB ${shipment.waybill} on WhatsApp?`)) return;
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/crm/orders/${orderId}/shipments/${shipment.id}/send-shipment-confirmation`, { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(result.message || result.error || 'WhatsApp request finished.');
  }

  return <div className="shipmentActions"><FulfillShipmentButton orderId={orderId} shipment={shipment} />{canPrint ? <PrintLabelButton shipmentId={shipment.id} /> : null}{canSendWhatsApp ? <button type="button" className="button secondary" onClick={sendWhatsApp} disabled={busy}>{busy ? 'Sending…' : 'Send WhatsApp update'}</button> : null}{canRaisePickup ? <button type="button" className="button secondary" onClick={raisePickup} disabled={busy}>{busy ? 'Raising…' : 'Raise pickup'}</button> : null}{canCancel ? <button type="button" className="button danger" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel'}</button> : null}{message ? <small>{message}</small> : null}</div>;
}
