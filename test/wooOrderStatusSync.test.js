import test from 'node:test';
import assert from 'node:assert/strict';
import { wooStatusForShipments, reconcileWooOrderStatus, reconcileWooShipmentStatuses } from '../src/wooOrderStatusSync.js';

const config = { woocommerce: { baseUrl: 'https://woo.example', consumerKey: 'test', consumerSecret: 'test', shipmentWriteback: { enabled: true } } };
const order = { id: 'ops1', source: 'woocommerce', woo_order_id: '7', payment_status: 'paid' };
const leg = status => ({ id: 's1', waybill: 'A1', direction: 'forward', status });

test('Woo mapping follows pickup/delivery evidence, not booking', () => {
  for (const status of ['booked', 'shipment_booked', 'pickup_pending', 'awaiting_fedex_awb']) assert.equal(wooStatusForShipments([leg(status)]), null);
  for (const status of ['picked-up', 'in-transit', 'out-for-delivery', 'dispatched']) assert.equal(wooStatusForShipments([leg(status)]), 'shipped');
  assert.equal(wooStatusForShipments([leg('delivered')]), 'completed');
  assert.equal(wooStatusForShipments([{ ...leg('delivered'), direction: 'reverse' }]), null);
});

test('split shipments complete only after all outbound legs are delivered', () => {
  assert.equal(wooStatusForShipments([leg('delivered'), leg('booked')]), 'shipped');
  assert.equal(wooStatusForShipments([leg('delivered'), leg('failed')]), 'shipped');
  assert.equal(wooStatusForShipments([leg('delivered'), leg('cancelled')]), 'completed');
  assert.equal(wooStatusForShipments([leg('delivered'), { status: 'failed', waybill: null }]), 'completed');
  assert.equal(wooStatusForShipments([leg('delivered'), { status: 'awaiting_fedex_awb', waybill: null }]), 'shipped');
});

test('Woo status transitions are verified and idempotent, without booking writes', async () => {
  let current = 'processing'; const puts = [];
  const fetchImpl = async (url, init) => {
    if (init.method === 'PUT') { current = JSON.parse(init.body).status; puts.push(current); }
    return { ok: true, json: async () => ({ status: current }) };
  };
  const options = { shipments: [leg('in-transit')], fetchImpl };
  assert.equal((await reconcileWooOrderStatus(order, config, options)).status, 'shipped');
  assert.equal((await reconcileWooOrderStatus(order, config, options)).skipped, true);
  assert.equal((await reconcileWooOrderStatus(order, config, { ...options, shipments: [leg('delivered')] })).status, 'completed');
  assert.equal((await reconcileWooOrderStatus(order, config, options)).skipped, true);
  assert.deepEqual(puts, ['shipped', 'completed']);
});

test('Woo cancelled, refunded, unpaid and disabled orders are preserved', async () => {
  for (const current of ['cancelled', 'refunded', 'pending', 'on-hold', 'failed', 'completed']) {
    const result = await reconcileWooOrderStatus(order, config, { shipments: [leg('in-transit')], fetchImpl: async (url, init) => {
      assert.notEqual(init.method, 'PUT'); return { ok: true, json: async () => ({ status: current }) };
    } });
    assert.equal(result.skipped, true);
  }
  assert.equal((await reconcileWooOrderStatus({ ...order, payment_status: 'not_paid' }, config)).reason, 'not-paid');
  assert.equal((await reconcileWooOrderStatus(order, { woocommerce: { shipmentWriteback: { enabled: false } } })).reason, 'disabled');
});

test('Woo refuses a status update that the store did not apply', async () => {
  await assert.rejects(reconcileWooOrderStatus(order, config, { shipments: [leg('delivered')], fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'processing' }) }) }), /did not accept/);
});

test('periodic reconciliation retries failures even for already-delivered shipment legs', async () => {
  let fail = true; let puts = 0;
  const db = { from: table => table === 'orders' ? { select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [order] }) }) }) }) }
    : table === 'shipments' ? { select: () => ({ eq: async () => ({ data: [leg('delivered')] }) }) }
    : { insert: async () => ({ error: null }) } };
  const fetchImpl = async (url, init) => {
    if (fail) return { ok: false, status: 503 };
    if (init.method === 'PUT') { puts++; return { ok: true, json: async () => ({ status: 'completed' }) }; }
    return { ok: true, json: async () => ({ status: 'shipped' }) };
  };
  assert.equal((await reconcileWooShipmentStatuses(config, { db, fetchImpl })).errors.length, 1);
  fail = false;
  assert.equal((await reconcileWooShipmentStatuses(config, { db, fetchImpl })).changed, 1);
  assert.equal(puts, 1);
});
