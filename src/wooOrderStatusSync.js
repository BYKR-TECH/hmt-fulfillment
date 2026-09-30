import { createServiceClient } from '../lib/supabase/server.js';
import { getConfig } from './config.js';

const shippedStates = new Set(['picked_up', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered']);
const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export function wooStatusForShipments(shipments) {
  const legs = shipments.filter(s => normalize(s.direction) !== 'reverse'
    && !['cancelled', 'canceled'].includes(normalize(s.status))
    // A failed booking without an AWB never became a package.
    && !(normalize(s.status) === 'failed' && !s.waybill));
  if (!legs.length) return null;
  if (legs.every(s => s.waybill && normalize(s.status) === 'delivered')) return 'completed';
  if (legs.some(s => s.waybill && shippedStates.has(normalize(s.status)))) return 'shipped';
  return null;
}

export async function reconcileWooOrderStatus(order, config, options = {}) {
  if (!config.woocommerce?.shipmentWriteback?.enabled) return { skipped: true, reason: 'disabled' };
  if (order.source !== 'woocommerce') return { skipped: true, reason: 'not-woo-order' };
  if (!['paid', 'approved'].includes(normalize(order.payment_status))) return { skipped: true, reason: 'not-paid' };
  if (['cancelled', 'canceled', 'refunded'].includes(normalize(order.status))) return { skipped: true, reason: 'protected-order' };
  const id = String(order.woo_order_id || order.external_order_id || '').trim();
  if (!id) return { skipped: true, reason: 'missing-woo-id' };
  const db = options.db || createServiceClient();
  let shipments = options.shipments;
  if (!shipments) {
    if (!db) return { skipped: true, reason: 'missing-supabase' };
    const result = await db.from('shipments').select('id,waybill,status,direction').eq('order_id', order.id);
    if (result.error) throw new Error(`Woo shipment lookup failed: ${result.error.message}`);
    shipments = result.data || [];
  }
  const target = wooStatusForShipments(shipments);
  if (!target) return { skipped: true, reason: 'not-shipped' };
  const woo = config.woocommerce;
  if (!woo.baseUrl || !woo.consumerKey || !woo.consumerSecret) throw new Error('Missing WooCommerce status-sync configuration.');
  const url = `${woo.baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${encodeURIComponent(id)}`;
  const headers = { Authorization: `Basic ${Buffer.from(`${woo.consumerKey}:${woo.consumerSecret}`).toString('base64')}`, 'Content-Type': 'application/json' };
  const fetchImpl = options.fetchImpl || fetch;
  const currentResponse = await fetchImpl(`${url}?_fields=id,status`, { headers, signal: AbortSignal.timeout(15000) });
  if (!currentResponse.ok) throw new Error(`Woo status read failed (${currentResponse.status}).`);
  const current = await currentResponse.json();
  // Never regress completed or overwrite unpaid/cancelled/refunded/custom holds.
  if (current.status === target || current.status === 'completed') return { skipped: true, reason: 'already-at-or-beyond-target', status: current.status };
  if (!['processing', 'shipped'].includes(current.status)) return { skipped: true, reason: 'protected-woo-status', status: current.status };
  const response = await fetchImpl(url, { method: 'PUT', headers, body: JSON.stringify({ status: target }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Woo status update failed (${response.status}).`);
  const updated = await response.json();
  if (updated.status !== target) throw new Error('WooCommerce did not accept the requested order status.');
  if (db) {
    const audit = await db.from('notes').insert({ order_id: order.id, note_type: 'automation', actor_name: 'Woo shipment status sync', body: `WooCommerce order ${id}: ${current.status} → ${target}, based on outbound shipment tracking.` });
    if (audit.error) throw new Error(`Woo status updated, but audit failed: ${audit.error.message}`);
  }
  return { ok: true, changed: true, woo_order_id: id, previous_status: current.status, status: target };
}

// Reconcile even unchanged tracking and delivered legs excluded by active polling.
// A failed Woo request is retried on the next existing automation cycle.
export async function reconcileWooShipmentStatuses(config = getConfig(), options = {}) {
  if (!config.woocommerce?.shipmentWriteback?.enabled) return { checked: 0, changed: 0, skipped: 0, errors: [] };
  const db = options.db || createServiceClient();
  if (!db) throw new Error('Supabase is required for Woo shipment status reconciliation.');
  const summary = { checked: 0, changed: 0, skipped: 0, errors: [] };
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('orders').select('id,source,woo_order_id,external_order_id,payment_status,status')
      .eq('source', 'woocommerce').order('id').range(offset, offset + 499);
    if (result.error) throw new Error(`Woo order lookup failed: ${result.error.message}`);
    for (const order of result.data || []) {
      summary.checked++;
      try {
        const status = await reconcileWooOrderStatus(order, config, { ...options, db });
        if (status.changed) summary.changed++; else summary.skipped++;
      } catch (error) { summary.errors.push(`${order.woo_order_id || order.external_order_id}: ${error.message}`); }
    }
    if ((result.data || []).length < 500) break;
  }
  return summary;
}
