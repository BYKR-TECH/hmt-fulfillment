import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { orderDisplayDetails } from '../lib/crm/order-display.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const rows = [
  { id: 'new', payment_status: 'PAID', internal_status: 'awaiting_packing' },
  { id: 'packed', payment_status: 'paid', internal_status: 'packed' },
  { id: 'fulfilled', payment_status: 'PAID', internal_status: 'packed', fulfillment_status: 'FULFILLED' },
  { id: 'cancelled', payment_status: 'PAID', internal_status: 'cancelled' },
  { id: 'issue', internal_status: 'issue_reported', installation_status: 'installed_successfully', feedback_status: 'review_received' }
];

async function summaryWithQueries({ legacy = false } = {}) {
  const queries = [];
  const db = { from(table) {
    let columns;
    const request = {
      select(value) { columns = value; queries.push({ table, columns }); return this; },
      neq() { return this; }, order() { return this; }, limit() { return this; },
      range() { return this; }, in() { return this; },
      then(resolve) {
        if (table === 'shipments') return Promise.resolve(resolve({ data: [{ order_id: 'packed', status: 'pickup_pending', waybill: 'AWB' }] }));
        if (legacy && !columns.includes('customers(')) return Promise.resolve(resolve({ error: { code: '42703' } }));
        return Promise.resolve(resolve({ data: rows }));
      }
    };
    return request;
  } };
  const { code } = transformSync(readFileSync(new URL('../lib/crm/data.js', import.meta.url), 'utf8'), {
    filename: 'data.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
  });
  const exports = {};
  runInNewContext(code, { exports, process, Map, Date, Intl, require: name => {
    if (name === '@/lib/supabase/server') return { createServiceClient: () => db };
    if (name === './order-display.js') return { orderDisplayDetails };
    return {};
  } });
  return { summary: JSON.parse(JSON.stringify(await exports.getDashboardSummary())), queries };
}

test('narrow dashboard query preserves counters and latest shipment overrides', async () => {
  const fast = await summaryWithQueries();
  const fallback = await summaryWithQueries({ legacy: true });
  assert.deepEqual(fast.summary, fallback.summary);
  assert.equal(fast.summary.newOrders, 1);
  assert.equal(fast.summary.shipmentsToBook, 1);
  assert.equal(fast.summary.pickupPending, 1);
  assert.equal(fast.summary.openIssues, 1);
  assert.equal(fast.queries.length, 2);
  assert.doesNotMatch(fast.queries[0].columns, /customers|raw_order|order_items|address/);
  assert.doesNotMatch(fast.queries[1].columns, /carrier_response/);
});
