import assert from 'node:assert/strict';
import test from 'node:test';
import { orderStatusAfterShipmentCancellation } from '../lib/crm/shipment-cancellation.js';

test('cancelled forward shipment returns a paid source order to packing for rebooking', () => {
  for (const status of ['APPROVED', 'fulfilled', 'processing']) {
    assert.equal(orderStatusAfterShipmentCancellation({ status, payment_status: 'paid', internal_status: 'shipment_booked' }, { direction: 'forward' }), 'awaiting_packing');
  }
});
test('source order cancellation and unpaid restrictions survive shipment cancellation', () => {
  for (const status of ['CANCELED', 'cancelled']) {
    assert.equal(orderStatusAfterShipmentCancellation({ status, payment_status: 'PAID' }), 'cancelled');
  }
  assert.equal(orderStatusAfterShipmentCancellation({ status: 'APPROVED', payment_status: 'unpaid' }), 'not_paid');
});
test('cancelling a reverse pickup preserves the forward order workflow', () => {
  assert.equal(orderStatusAfterShipmentCancellation({ status: 'fulfilled', payment_status: 'paid', internal_status: 'installation_pending' }, { direction: 'reverse' }), 'installation_pending');
});

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const { code } = transformSync(readFileSync(new URL('../lib/crm/data.js', import.meta.url), 'utf8'), {
  filename: 'data.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
});

test('successful carrier cancellation stores cancelled shipment and rebookable order', async () => {
  let shipment = { id: 's1', order_id: 'o1', courier_code: 'delhivery', waybill: 'AWB1', status: 'booked', direction: 'forward' };
  let order = { id: 'o1', status: 'APPROVED', payment_status: 'PAID', internal_status: 'shipment_booked' };
  const client = { from(table) {
    let patch;
    const query = {
      select: () => query, eq: () => query,
      update: value => { patch = value; return query; },
      maybeSingle: async () => ({ data: table === 'shipments' ? shipment : order }),
      single: async () => { shipment = { ...shipment, ...patch }; return { data: shipment }; },
      then: resolve => { order = { ...order, ...patch }; return Promise.resolve({ error: null }).then(resolve); }
    };
    return query;
  } };
  const mocks = {
    './shipment-cancellation.js': { orderStatusAfterShipmentCancellation },
    '@/lib/supabase/server': { createServiceClient: () => client },
    '@/src/config.js': { getConfig: () => ({}) },
    '@/src/delhivery.js': { cancelDelhiveryShipment: async awb => { assert.equal(awb, 'AWB1'); return { status: true }; } }
  };
  const exports = {};
  runInNewContext(code, { exports, require: name => mocks[name] || {}, console });
  const result = await exports.cancelCourierShipment('o1', 's1');
  assert.equal(result.ok, true);
  assert.equal(shipment.status, 'cancelled');
  assert.equal(order.status, 'APPROVED');
  assert.equal(order.internal_status, 'awaiting_packing');
  assert.equal(order.shipment_status, 'cancelled');
  assert.equal(order.fulfillment_status, 'NOT_FULFILLED');
});
