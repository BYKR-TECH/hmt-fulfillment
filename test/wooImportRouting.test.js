import assert from 'node:assert/strict';
import test from 'node:test';
import { planWooOrderRepairs } from '../scripts/repair-misclassified-woo-orders.js';
import { buildInvoiceModel, buildInvoicePdf } from '../lib/crm/invoice-pdf.js';

const woo = {
  id: 690, number: '11059', status: 'processing', currency: 'INR', total: '236', date_paid: '2026-09-30T12:00:00',
  billing: { first_name: 'Test', last_name: 'Buyer', email: 'test@example.com', phone: '9000000000', address_1: 'Test street', city: 'Pune', state: 'MH', postcode: '411001', country: 'IN' },
  shipping: {}, line_items: [{ id: 3, name: 'Cruise Control Kit', sku: 'KIT', quantity: 2, price: 118, subtotal: '236', total: '236' }]
};

test('Woo payload sent to legacy Wix import saves Woo identity, buyer, address and invoice items', async t => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const calls = [];
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url); const table = parsed.pathname.split('/').pop();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ table, method: init.method, query: parsed.searchParams, body });
    return new Response(JSON.stringify(init.method === 'GET' ? [] : [{ id: `${table}-id`, ...body }]), { status: 200 });
  };
  const { upsertWixOrder } = await import('../src/store.js');
  const result = await upsertWixOrder(woo);
  assert.equal(result.source, 'woocommerce');
  assert.equal(result.woo_order_id, '690');
  assert.equal(result.wix_order_id, null);
  assert.ok(!calls.some(call => call.query.has('wix_order_id') || call.query.get('on_conflict') === 'wix_order_id'));
  const customer = calls.find(call => call.table === 'customers' && call.body).body;
  const address = calls.find(call => call.table === 'customer_addresses' && call.body).body;
  const item = calls.find(call => call.table === 'order_items' && call.body).body;
  assert.equal(customer.name, 'Test Buyer');
  assert.equal(address.address_line1, 'Test street');
  const detail = { order: { source: result.source, order_value: result.total_amount, shipping_country: 'IN', customer_name: customer.name, address_line1: address.address_line1 }, items: [item] };
  const invoice = buildInvoiceModel(detail);
  assert.equal(invoice.items[0].name, 'Cruise Control Kit');
  assert.equal(invoice.items[0].quantity, 2);
  assert.equal(invoice.totals.grandTotal, 236);
  assert.equal(invoice.shippingAddress.name, 'Test Buyer');
  assert.equal(buildInvoicePdf(detail).subarray(0, 4).toString(), '%PDF');
  const { bookWixOrder } = await import('../src/booking.js');
  const { getConfig } = await import('../src/config.js');
  const booked = await bookWixOrder(woo, { ...getConfig(), createAwbOnBook: false });
  assert.equal(booked.shipment.status, 'pending-zone');
  assert.ok(!calls.some(call => call.query.get('on_conflict') === 'wix_order_id'));
  assert.ok(!calls.some(call => call.body?.wix_fulfillment_status));
});

test('repair only pairs misclassified native Woo records with an unambiguous counterpart', () => {
  const broken = { id: 'broken', source: 'wix', wix_order_id: '690', raw_order: woo };
  const counterpart = { id: 'good', source: 'woocommerce', woo_order_id: '690' };
  assert.deepEqual(planWooOrderRepairs([broken, counterpart, { id: 'wix', source: 'wix', raw_order: { id: 'wix', lineItems: [] } }]), [{ broken, counterpart }]);
  assert.throws(() => planWooOrderRepairs([broken]), /Expected one Woo counterpart/);
  assert.throws(() => planWooOrderRepairs([broken, counterpart, { ...counterpart, id: 'another' }]), /got 2/);
  assert.equal(planWooOrderRepairs([{ ...broken, source: 'woocommerce' }, { ...counterpart, source: 'merged' }]).length, 0);
});

 test('merged order links resolve to the preserved shipment-bearing UUID', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const queries = [];
  globalThis.fetch = async url => {
    const query = new URL(url).searchParams; queries.push(query);
    return new Response(JSON.stringify(query.get('id') === 'eq.alias'
      ? [{ id: 'alias', source: 'merged', external_order_id: 'original' }]
      : [{ id: 'original', source: 'woocommerce' }]), { status: 200 });
  };
  const { findOrderById } = await import('../src/store.js');
  assert.equal((await findOrderById('alias')).id, 'original');
  assert.equal(queries[1].get('source'), 'neq.merged');
});
