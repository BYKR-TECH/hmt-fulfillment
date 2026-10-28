import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveShipmentState, groupErrors, istDayStart, laneFor, orderStage, pickupWindow, primaryShipment, reviewFlags, shipmentState
} from '../lib/ops/model.ts';

const paidWoo = { id: 'o1', source: 'woocommerce', payment_status: 'paid', internal_status: 'awaiting_packing', fulfillment_status: 'not_fulfilled' };
const ship = (status, extra = {}) => ({ id: `s-${status}`, status, waybill: 'AWB1', direction: 'forward', created_at: '2026-10-01T00:00:00Z', ...extra });

test('legacy shipment statuses map to the spec states', () => {
  const cases = {
    booked: 'booked', 'shipment-booked': 'booked', shipment_booked: 'booked', pickup_pending: 'pickup_requested',
    'picked-up': 'picked_up', dispatched: 'in_transit', 'in-transit': 'in_transit', 'out-for-delivery': 'out_for_delivery',
    failed_delivery: 'delivery_failed', delivered: 'delivered', rto: 'rto_in_transit', returned: 'rto_delivered',
    cancelled: 'cancelled', canceled: 'cancelled', 'pickup-error': 'not_picked', 'pending-international': 'booking',
    awaiting_fedex_awb: 'booking', 'Some Courier Novelty': 'exception', '': 'exception'
  };
  for (const [status, expected] of Object.entries(cases)) assert.equal(shipmentState({ status, waybill: 'X' }), expected, status);
  assert.equal(shipmentState({ status: 'failed', waybill: '' }), 'booking_failed');
  assert.equal(shipmentState({ status: 'failed', waybill: 'AWB' }), 'exception');
});

test('unknown courier statuses never count as progress', () => {
  assert.equal(orderStage(paidWoo, ship('Weird new status')), 'booked');
  assert.notEqual(orderStage(paidWoo, ship('Weird new status')), 'shipped');
});

test('order stage follows the primary shipment and ignores cancelled or failed bookings', () => {
  assert.equal(orderStage(paidWoo, null), 'paid');
  assert.equal(orderStage({ ...paidWoo, payment_status: 'pending' }, null), 'not_paid');
  assert.equal(orderStage({ ...paidWoo, automation_hold: true }, null), 'on_hold');
  assert.equal(orderStage(paidWoo, ship('booked')), 'booked');
  assert.equal(orderStage(paidWoo, ship('picked-up')), 'shipped');
  assert.equal(orderStage(paidWoo, ship('delivered')), 'delivered');
  assert.equal(orderStage(paidWoo, ship('cancelled')), 'paid');
  assert.equal(orderStage({ ...paidWoo, internal_status: 'cancelled' }, null), 'cancelled');
  assert.equal(orderStage({ ...paidWoo, payment_status: 'refunded' }, null), 'refunded');
  // A cancelled store order that the courier already collected stays visible as shipped.
  assert.equal(orderStage({ ...paidWoo, status: 'canceled' }, ship('in-transit')), 'shipped');
});

test('COD is never treated as paid-and-ready; it is flagged for review', () => {
  const cod = { ...paidWoo, payment_status: 'pending', payment_method: 'cod', country: 'IN', postal_code: '560001', phone: '9999999999' };
  const stage = orderStage(cod, null);
  assert.equal(stage, 'paid');
  assert.match(reviewFlags(cod, stage).map(flag => flag.reason).join(), /Cash on delivery/);
});

test('store-fulfilled orders count as picked up even if tracking never updated the row', () => {
  const wixFulfilled = { ...paidWoo, source: 'wix', fulfillment_status: 'FULFILLED', wix_fulfillment_status: 'synced_from_wix' };
  assert.equal(effectiveShipmentState(ship('booked'), wixFulfilled), 'picked_up');
  assert.equal(orderStage(wixFulfilled, ship('booked')), 'shipped');
  assert.equal(orderStage(wixFulfilled, null), 'shipped');
  // A second outbound leg waiting for pickup is not hidden by the first leg's fulfilment.
  assert.equal(effectiveShipmentState(ship('booked'), { ...wixFulfilled, wix_fulfillment_status: 'awaiting-pickup' }), 'booked');
  // Delivered stays delivered.
  assert.equal(effectiveShipmentState(ship('delivered'), wixFulfilled), 'delivered');
});

test('primary shipment is the earliest active outbound original', () => {
  const rows = [
    ship('cancelled', { id: 'a', created_at: '2026-10-01T00:00:00Z' }),
    ship('booked', { id: 'b', created_at: '2026-10-02T00:00:00Z' }),
    ship('booked', { id: 'c', created_at: '2026-10-03T00:00:00Z' }),
    ship('booked', { id: 'r', created_at: '2026-09-01T00:00:00Z', direction: 'reverse' })
  ];
  assert.equal(primaryShipment(rows).id, 'b');
  assert.equal(primaryShipment([rows[0]]).id, 'a');
  assert.equal(primaryShipment([]), null);
});

test('review flags catch invalid PIN, missing phone and stale orders', () => {
  const now = new Date('2026-10-13T06:00:00Z');
  const base = { ...paidWoo, country: 'IN', postal_code: '56001', phone: '', placed_at: '2026-08-01T00:00:00Z' };
  const reasons = reviewFlags(base, 'paid', now).map(flag => flag.reason).join(' | ');
  assert.match(reasons, /6-digit/);
  assert.match(reasons, /No phone/);
  assert.match(reasons, /never booked/);
  assert.deepEqual(reviewFlags({ ...base, postal_code: '560001', phone: '9876543210', placed_at: '2026-10-12T00:00:00Z' }, 'paid', now), []);
});

test('lanes: only India is domestic; express shipping chooses the express lane', () => {
  assert.equal(laneFor({ country: 'IN' }), 'domestic');
  assert.equal(laneFor({ country: '' }), 'domestic');
  assert.equal(laneFor({ country: 'BD' }), 'intl_standard');
  assert.equal(laneFor({ country: 'US', selected_shipping_title: 'International Express' }), 'intl_express');
});

test('IST day boundaries and pickup cut-off', () => {
  assert.equal(istDayStart(new Date('2026-10-13T20:00:00Z')), '2026-10-13T18:30:00.000Z');
  assert.equal(istDayStart(new Date('2026-10-13T10:00:00Z')), '2026-10-12T18:30:00.000Z');
  assert.deepEqual(pickupWindow(new Date('2026-10-13T04:00:00Z')), { date: '2026-10-13', time: '11:00:00' }); // 09:30 IST
  assert.deepEqual(pickupWindow(new Date('2026-10-13T08:00:00Z')), { date: '2026-10-13', time: '14:00:00' }); // 13:30 IST
  assert.deepEqual(pickupWindow(new Date('2026-10-13T11:00:00Z')), { date: '2026-10-14', time: '11:00:00' }); // 16:30 IST
});

test('repeated integration errors collapse into one issue', () => {
  const rows = [
    { id: '1', integration: 'amazon', operation: 'order-sync', message: 'POST failed (400) for 123', occurred_at: '2026-10-13T01:00:00Z' },
    { id: '2', integration: 'amazon', operation: 'order-sync', message: 'POST failed (400) for 124', occurred_at: '2026-10-13T02:00:00Z' },
    { id: '3', integration: 'courier', operation: 'courier-booking', message: 'retry limit', occurred_at: '2026-10-12T00:00:00Z' }
  ];
  const groups = groupErrors(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].latest, '2026-10-13T02:00:00Z');
});
