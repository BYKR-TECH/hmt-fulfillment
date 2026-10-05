import test from 'node:test';
import assert from 'node:assert/strict';
import { catchUpShipmentMessages, shipmentMessageCatchupEligible } from '../lib/crm/shipment-message-catchup.js';

const order = { id: 'o', payment_status: 'paid' };
const shipment = { id: 's', order_id: 'o', waybill: 'AWB', status: 'in_transit' };
test('catch-up accepts pickup and later active statuses, not booking or terminal legs', () => {
  for (const status of ['picked-up', 'dispatched', 'in_transit', 'out-for-delivery']) assert.equal(shipmentMessageCatchupEligible(order, { ...shipment, status }), true);
  for (const status of ['booked', 'pickup-pending', 'delivered', 'returned', 'rto', 'cancelled']) assert.equal(shipmentMessageCatchupEligible(order, { ...shipment, status }), false);
  assert.equal(shipmentMessageCatchupEligible(order, { ...shipment, direction: 'reverse' }), false);
  assert.equal(shipmentMessageCatchupEligible({ ...order, payment_status: 'unpaid' }, shipment), false);
  assert.equal(shipmentMessageCatchupEligible({ ...order, status: 'cancelled' }, shipment), false);
});
test('unchanged in-transit shipment is sent once through the existing duplicate guard', async () => {
  let sent = false;
  const db = { from: () => ({ select() { return this; }, order() { return this; }, range: async () => ({ data: [shipment] }) }) };
  const options = { db, loadOrder: async () => order, send: async (_order, _shipment, options) => {
    assert.equal(options.trigger, 'shipment-catchup');
    if (sent) return { skipped: true, reason: 'already-sent' };
    sent = true; return { status: 'sent' };
  } };
  const config = { chatwoot: { shipmentConfirmationEnabled: true } };
  assert.equal((await catchUpShipmentMessages(config, options)).sent, 1);
  assert.equal((await catchUpShipmentMessages(config, options)).sent, 0);
  assert.equal((await catchUpShipmentMessages({ chatwoot: {} }, options)).checked, 0);
});
