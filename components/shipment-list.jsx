'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FulfillShipmentButton } from './fulfill-shipment-button';
import { Search } from 'lucide-react';
import { StatusPill } from './status-pill';
import { canCancelShiprocket } from '@/lib/crm/shiprocket-cancellation.js';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function ShipmentFilters({ query = '', status = '', courier = '' }) {
  return <form className="filters" action="/shipments">
    <input type="hidden" name="tab" value="all" />
    <label><span>Search</span><div style={{ position: 'relative' }}><Search size={16} style={{ left: 10, position: 'absolute', top: 11, color: '#667085' }} /><input name="q" defaultValue={query} placeholder="Name, phone, order, AWB" style={{ paddingLeft: 32 }} /></div></label>
    <label><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option>{['shipment_booked', 'pickup_pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'rto', 'failed_delivery', 'cancelled', 'returned'].map(value => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
    <label><span>Courier</span><select name="courier" defaultValue={courier}><option value="">All couriers</option><option value="delhivery">Delhivery</option><option value="fedex">FedEx</option><option value="shiprocket">Shiprocket</option></select></label>
    <div><span aria-hidden="true">&nbsp;</span><button type="submit">Apply</button></div>
  </form>;
}

export function ShipmentList({ shipments }) {
  return <div className="tableWrap"><table><thead><tr><th>Shipment</th><th>Order / customer</th><th>Courier</th><th>Status</th><th>Package</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
    {shipments.map(shipment => <ShipmentRow shipment={shipment} key={shipment.id} />)}
    {!shipments.length ? <tr><td colSpan="7" className="empty">No matching shipments.</td></tr> : null}
  </tbody></table></div>;
}

function ShipmentRow({ shipment }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const view = shipmentRowView(shipment);
  async function cancel() {
    if (busy) return;
    if (!window.confirm(`Cancel ${shipment.courier_code} shipment ${shipment.waybill || shipment.order_number}? This cannot be undone.`)) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/crm/orders/${shipment.order_id}/shipments/${shipment.id}/cancel`, { method: 'POST' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error || 'Cancellation request failed.');
        return;
      }
      const result = await response.json();
      setMessage(result.message || 'Cancellation request finished.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <tr>
    <ShipmentIdentity view={view} />
    <OrderCustomer view={view} />
    <td><strong>{view.courier}</strong><span className="subtle">{view.service}</span></td>
    <ShipmentStatus shipment={shipment} />
    <td>{view.weight}<span className="subtle">{view.dimensions}</span></td>
    <td>{view.updatedAt}</td>
    <ShipmentRowActions shipment={shipment} view={view} busy={busy} message={message} onCancel={cancel} />
  </tr>;
}

function ShipmentIdentity({ view }) { return <td><strong>{view.waybill}</strong><span className="subtle">{view.purpose} · {view.flow}</span></td>; }
function OrderCustomer({ view }) { return <td>{view.orderId ? <Link href={`/orders/${view.orderId}`}><strong>{view.orderNumber}</strong></Link> : <strong>{view.orderNumber}</strong>}<span className="subtle">{view.customer}</span></td>; }
function ShipmentStatus({ shipment }) { const error = shipment.error || shipment.label_error; return <td><StatusPill value={shipment.status || 'not_set'} />{error ? <span className="subtle dangerText">{error}</span> : null}</td>; }
function ShipmentRowActions({ shipment, view, busy, message, onCancel }) { return <td><div className="shipmentActions"><FulfillShipmentButton orderId={shipment.order_id} shipment={shipment} />{view.tracking ? <a className="button secondary" href={view.tracking} target="_blank" rel="noreferrer">Track</a> : null}{shipment.label_url ? <a className="button secondary" href={shipment.label_url} target="_blank" rel="noreferrer">Label</a> : null}{view.canCancel ? <button type="button" className="danger" onClick={onCancel} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel'}</button> : null}{message ? <small className={message.toLowerCase().includes('accepted') ? 'muted' : 'dangerText'}>{message}</small> : null}</div></td>; }

function shipmentRowView(shipment) {
  const status = String(shipment.status || '').toLowerCase();
  return {
    waybill: shipment.waybill || 'AWB pending', purpose: shipment.shipment_type || shipment.direction || 'original', flow: shipment.flow || 'domestic',
    orderId: shipment.order_id, orderNumber: shipment.order_number || (shipment.order_id ? 'Open order' : '-'), customer: [shipment.customer_name, shipment.customer_phone].filter(Boolean).join(' · ') || shipment.source || '-',
    courier: shipment.courier_code || '-', service: shipment.service_code || shipment.courier_service_code || shipment.service_mode || '-',
    weight: shipment.weight_grams ? `${shipment.weight_grams} g` : '-', dimensions: [shipment.length_cm, shipment.width_cm, shipment.height_cm].every(Boolean) ? `${shipment.length_cm} × ${shipment.width_cm} × ${shipment.height_cm} cm` : '',
    updatedAt: shipment.updated_at ? DATE_TIME_FORMATTER.format(new Date(shipment.updated_at)) : '-',
    tracking: shipment.tracking_url || (shipment.waybill && String(shipment.courier_code).toLowerCase() === 'delhivery' ? `https://www.delhivery.com/track/package/${encodeURIComponent(shipment.waybill)}` : ''),
    canCancel: Boolean(shipment.order_id && (canCancelShiprocket(shipment) || (shipment.waybill && String(shipment.courier_code || '').toLowerCase() === 'delhivery' && !['delivered', 'cancelled', 'returned', 'rto', 'rto_in_transit', 'rto_delivered'].includes(status))))
  };
}
