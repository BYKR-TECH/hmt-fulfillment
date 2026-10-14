import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecoverySummary } from '../src/shipmentRecovery.js';
import { normalizeDelhiveryStatus, extractTrackingEvents } from '../src/delhiveryTracking.js';
import { canCancelShiprocket } from '../lib/crm/shiprocket-cancellation.js';
const order = { payment_status: 'paid', status: 'shipped' };
const returning = { id: 'old', waybill: 'OLD', direction: 'forward', courier_code: 'delhivery', status: 'rto_in_transit', created_at: '2026-10-01', updated_at: '2026-10-14' };
const replacement = { id: 'new', waybill: 'NEW', direction: 'forward', courier_code: 'shiprocket', status: 'booked', created_at: '2026-10-13', label_url: 'https://example.test/label' };
test('RT overrides In Transit and Delivered and propagates to scan events', () => {
  assert.equal(normalizeDelhiveryStatus('In Transit', 'RT'), 'rto_in_transit');
  assert.equal(normalizeDelhiveryStatus('Delivered', 'RT'), 'rto_delivered');
  assert.equal(normalizeDelhiveryStatus('Delivered', 'DL'), 'delivered');
  assert.equal(extractTrackingEvents({ Scans: [{ ScanDetail: { Scan: 'In Transit', ScanType: 'RT' } }] })[0].normalized_status, 'rto_in_transit');
});
test('RTO reopens paid fulfillment and reverse pickup cannot satisfy it', () => {
  const result = buildRecoverySummary(order, [returning, { ...replacement, direction: 'reverse' }]);
  assert.equal(result.internal_status, 'replacement_required');
  assert.equal(result.fulfillment_status, 'NOT_FULFILLED');
  assert.equal(result.shipment_status, 'rto_in_transit');
});
test('old return scans cannot overwrite a booked or delivered replacement', () => {
  for (const status of ['booked', 'delivered']) {
    const result = buildRecoverySummary(order, [returning, { ...replacement, status }]);
    assert.equal(result.shipment_waybill, 'NEW');
    assert.equal(result.shipment_courier_code, 'shiprocket');
    assert.equal(result.internal_status, status === 'delivered' ? 'delivered' : 'shipment_booked');
  }
});
test('failed or cancelled replacement does not hide an unfulfilled RTO order', () => {
  const result = buildRecoverySummary(order, [returning, { ...replacement, status: 'cancelled' }]);
  assert.equal(result.internal_status, 'replacement_required');
  assert.equal(buildRecoverySummary({ ...order, payment_status: 'unpaid' }, [returning]).internal_status, undefined);
  assert.equal(buildRecoverySummary({ ...order, status: 'cancelled' }, [returning]).internal_status, undefined);
});
test('Shiprocket cancellation is available only before pickup and with a carrier order id', () => {
  const shipment = { courier_code: 'shiprocket', status: 'booked', waybill: 'BD123', carrier_response: { order_id: 123 } };
  assert.equal(canCancelShiprocket(shipment), true);
  assert.equal(canCancelShiprocket({ ...shipment, status: 'in-transit' }), false);
  assert.equal(canCancelShiprocket({ ...shipment, status: 'cancelled' }), false);
  assert.equal(canCancelShiprocket({ ...shipment, status: 'failed', waybill: null }), false);
  assert.equal(canCancelShiprocket({ ...shipment, carrier_response: {} }), false);
});
