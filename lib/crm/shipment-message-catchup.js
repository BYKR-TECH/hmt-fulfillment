import { findOrderById } from '../../src/store.js';
import { sendPickupConfirmationOnce } from './whatsapp-notifications.js';

const normalize = value => String(value || '').trim().toLowerCase().replaceAll('_', '-');
const ACTIVE = new Set(['picked-up', 'dispatched', 'in-transit', 'out-for-delivery']);

export function shipmentMessageCatchupEligible(order, shipment) {
  return Boolean(order && shipment?.waybill && shipment.direction !== 'reverse' &&
    ACTIVE.has(normalize(shipment.status)) &&
    ['paid', 'approved'].includes(normalize(order.payment_status)) &&
    !['cancelled', 'canceled', 'refunded', 'merged'].includes(normalize(order.status)) &&
    !['cancelled', 'completed', 'merged'].includes(normalize(order.internal_status)));
}

// Reconcile missing messages independently of tracking transitions. Never book,
// fulfill, or send a "shipped" message for delivered/returned shipments here.
export async function catchUpShipmentMessages(config, { db, loadOrder = findOrderById, send = sendPickupConfirmationOnce } = {}) {
  const result = { checked: 0, sent: 0, skipped: 0, errors: [] };
  if (!config.chatwoot?.shipmentConfirmationEnabled) return result;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('shipments').select('*').order('id').range(offset, offset + 499);
    if (error) throw new Error(`Shipment message catch-up lookup failed: ${error.message}`);
    for (const shipment of data || []) {
      if (!ACTIVE.has(normalize(shipment.status)) || !shipment.waybill || shipment.direction === 'reverse') continue;
      result.checked += 1;
      try {
        const order = await loadOrder(shipment.order_id);
        if (!shipmentMessageCatchupEligible(order, shipment)) { result.skipped += 1; continue; }
        const sent = await send(order, shipment, { config, db, trigger: 'shipment-catchup' });
        if (sent.skipped) result.skipped += 1;
        else result.sent += 1;
      } catch (error) {
        result.errors.push(`Shipment ${shipment.id}: ${error.message}`);
      }
    }
    if ((data || []).length < 500) return result;
  }
}
