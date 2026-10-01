import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { orderDisplayDetails } from '../lib/crm/order-display.js';
import { extractOrderTaxDetails } from '../lib/crm/order-tax.js';
import { normalizeWooCommerceOrder } from '../src/fulfillment.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
function load(file, mocks) {
  const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'commonjs' }
  });
  const exports = {};
  runInNewContext(code, { exports, require: name => mocks[name] || (name.startsWith('.') || name.startsWith('@/') ? {} : require(name)), URLSearchParams, console });
  return exports;
}
const linkMock = { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children), __esModule: true };
function dataHarness(rows, { queryIds = rows.map(row => row.id), error = null } = {}) {
  const selects = [], requests = [];
  const client = { from(table) {
    const state = { table, filters: [], orders: [], from: 0, to: Infinity };
    const builder = {
      select(columns, options) { selects.push({ table, columns, options }); return builder; },
      neq(key, value) { state.filters.push(row => row[key] !== value); return builder; },
      eq(key, value) { state.filters.push(row => row[key] === value); return builder; },
      in(key, values) { assert.ok(values.length <= 200 || key !== 'id'); state.filters.push(row => values.includes(row[key])); return builder; },
      order(key, options = {}) { state.orders.push({ key, ...options }); return builder; },
      range(from, to) { state.from = from; state.to = to; return builder; },
      limit(limit) { state.to = limit - 1; return builder; },
      then(resolve) {
        let data = (table === 'orders' ? rows : []).filter(row => state.filters.every(filter => filter(row)));
        data.sort((a, b) => {
          for (const { key, ascending = true, nullsFirst = false } of state.orders) {
            if (a[key] === b[key]) continue;
            if (a[key] == null) return nullsFirst ? -1 : 1;
            if (b[key] == null) return nullsFirst ? 1 : -1;
            const difference = String(a[key]).localeCompare(String(b[key]));
            if (difference) return ascending ? difference : -difference;
          }
          return 0;
        });
        const count = data.length;
        data = data.slice(state.from, state.to + 1);
        requests.push({ table, from: state.from, to: state.to });
        return Promise.resolve({ data, count, error: table === 'orders' ? error : null }).then(resolve);
      }
    };
    return builder;
  } };
  const api = load('../lib/crm/data.js', {
    '@/lib/supabase/server': { createServiceClient: () => client },
    './order-display.js': { orderDisplayDetails },
    './order-search': { findOrderIdsMatchingQuery: async (_client, _query, options) => { assert.equal(options.all, true); return queryIds; } }
  });
  return { api, selects, requests };
}
function fixture(index, source = 'wix') {
  return { id: `id-${String(index).padStart(5, '0')}`, source, external_order_id: String(index), source_created_at: '2026-09-30T10:00:00Z',
    internal_status: index % 2 ? 'new' : 'delivered', total_amount: 118, tax_amount: 18, subtotal: 100, shipping_amount: 0,
    order_items: [{ id: `item-${index}`, product_name: `Kit ${index}`, quantity: 1, total_price: 118, hsn_code: '90328910' }],
    customers: { name: `Buyer ${index}`, tax_id: '29ABCDE1234F1Z5', tax_id_type: 'GSTIN' },
    shipping_address: { address_line1: `${index} Shipping Road`, address_line2: 'Apartment 2', city: 'Bengaluru', state: 'KA', postal_code: '560102', country: 'IN' },
    billing_address: { address_line1: `${index} Billing Road`, city: 'Pune', state: 'MH', postal_code: '411001', country: 'IN' }
  };
}

test('every order is reachable beyond 150 and 1000 with no duplicates or merged aliases', async () => {
  const rows = Array.from({ length: 1655 }, (_, i) => fixture(i));
  rows.push({ ...fixture(2000), source: 'merged' });
  const { api } = dataHarness(rows);
  const ids = [];
  for (let page = 1; page <= 34; page++) {
    const result = await api.listOrdersPage({ page });
    assert.equal(result.total, 1655); assert.equal(result.pageCount, 34);
    ids.push(...result.orders.map(order => order.id));
  }
  assert.equal(ids.length, 1655); assert.equal(new Set(ids).size, 1655);
  assert.ok(!ids.includes('id-02000'));
  assert.equal((await api.listOrdersPage({ page: 999 })).page, 34);
  assert.equal((await api.listOrdersPage({ page: '-2' })).page, 1);
});

test('broad search retains every match and filters before page slicing', async () => {
  const rows = Array.from({ length: 665 }, (_, i) => fixture(i, i % 2 ? 'wix' : 'woocommerce'));
  const { api } = dataHarness(rows);
  const result = await api.listOrdersPage({ query: '1', source: 'woocommerce', status: 'delivered', page: 6 });
  assert.equal(result.total, 333); assert.equal(result.pageCount, 7); assert.equal(result.orders.length, 50);
  assert.ok(result.orders.every(order => order.source === 'woocommerce' && order.internal_status === 'delivered'));
  const last = await api.listOrdersPage({ query: '1', source: 'woocommerce', status: 'delivered', page: 7 });
  assert.equal(last.orders.length, 33);
});

test('page query requests totals, delivery details and tax source projections', async () => {
  const { api, selects } = dataHarness([fixture(1)]);
  const result = await api.listOrdersPage({ page: 1 });
  for (const field of ['subtotal', 'tax_amount', 'discount_amount', 'shipping_amount', 'selected_shipping_title', 'source_metadata:raw_order->meta_data', 'source_billing_info:raw_order->billingInfo', 'address_line1', 'address_line2', 'tax_id_type']) assert.ok(selects[0].columns.includes(field));
  assert.equal(selects[0].options.count, 'exact');
  assert.equal(result.orders[0].shipping_address_line2, 'Apartment 2');
  assert.equal(result.orders[0].billing_address_line1, '1 Billing Road');
  assert.equal(result.orders[0].buyer_gst, '29ABCDE1234F1Z5');
  assert.equal(result.orders[0].tax_amount, 18);
});

test('an orders query failure is surfaced instead of appearing as an empty successful page', async () => {
  const { api } = dataHarness([], { error: { message: 'Database unavailable' } });
  await assert.rejects(api.listOrdersPage(), /Could not load orders: Database unavailable/);
});

test('source fallback restores Wix/Woo addresses and order tax data while keeping operator edits', () => {
  const display = orderDisplayDetails({ id: 'woo', source: 'woocommerce', external_order_id: '690',
    source_billing: { first_name: 'Source', last_name: 'Buyer', address_1: 'Source Billing', city: 'Pune', company: 'Buyer Company' },
    source_shipping: { first_name: 'Recipient', address_1: 'Source Shipping', postcode: '411001' },
    source_metadata: [{ key: 'billing_tax_id', value: '29ABCDE1234F1Z5' }],
    shipping_address: { address_line1: 'Operator Shipping' }, customers: { name: 'Operator Buyer' }
  });
  assert.equal(display.customer.name, 'Operator Buyer'); assert.equal(display.shipping.address_line1, 'Operator Shipping');
  assert.equal(display.billing.address_line1, 'Source Billing'); assert.equal(display.billingCompany, 'Buyer Company');
  assert.equal(display.tax.id, '29ABCDE1234F1Z5'); assert.equal(display.tax.type, 'GSTIN');
  const wix = orderDisplayDetails({ source: 'wix', source_billing_info: { contactDetails: { firstName: 'Wix Buyer', vatId: { id: '29ABCDE1234F1Z5', type: 'GSTIN' } }, address: { addressLine: 'Wix Billing' } } });
  assert.equal(wix.customer.name, 'Wix Buyer'); assert.equal(wix.billing.address_line1, 'Wix Billing'); assert.equal(wix.tax.id, '29ABCDE1234F1Z5');
});

test('Woo ingestion persists billing_tax_id and tax metadata without interpreting tax totals as IDs', () => {
  const normalized = normalizeWooCommerceOrder({ id: 10, billing: {}, line_items: [], meta_data: [{ key: 'billing_tax_id', value: '29abcde1234f1z5' }] });
  assert.equal(normalized.customer.tax_id, '29ABCDE1234F1Z5'); assert.equal(normalized.customer.tax_id_type, 'GSTIN');
  assert.equal(extractOrderTaxDetails({ total_tax: '18', tax_lines: [{ rate_id: 123 }] }).id, '');
  assert.equal(extractOrderTaxDetails({ meta_data: [{ key: '_billing_vat_id', value: 'FR123456789' }] }).type, 'VAT');
});

test('Orders page renders full details for each row and honest missing-data labels', async () => {
  const { api } = dataHarness([fixture(1), { ...fixture(2), customers: null, shipping_address: null, billing_address: null }]);
  const orders = (await api.listOrdersPage()).orders;
  const dataMock = { formatCurrency: (value, currency = 'INR') => `${currency} ${value}` };
  const { OrderContents } = load('../components/order-contents.jsx', { '@/lib/crm/data': dataMock });
  const { OrderTable } = load('../components/order-table.jsx', {
    'next/link': linkMock, '@/lib/crm/data': dataMock,
    './order-contents': { OrderContents }, './status-pill': { StatusPill: ({ value }) => React.createElement('span', null, value) },
    '@/lib/crm/constants': { STATUS_FILTERS: [] }
  });
  const html = renderToStaticMarkup(React.createElement(OrderTable, { orders, showDetails: true }));
  for (const text of ['1 Shipping Road', 'Apartment 2', '1 Billing Road', '29ABCDE1234F1Z5', 'Tax recorded:', 'HSN:', '90328910', 'Open invoice', 'Customer name not provided', 'Shipping address not provided', 'Billing address not provided', 'GSTIN not provided', 'Kit 1', 'Kit 2', 'Delivery option', 'Fulfillment']) assert.ok(html.includes(text), `Missing ${text}`);
  assert.equal((html.match(/class="orderDetailsRow"/g) || []).length, 2);
  assert.doesNotMatch(html, /<th>Wix|undefined|NaN/);
});

test('page navigation preserves active filters and resets pagination when filters change', async () => {
  const page = load('../app/orders/page.jsx', {
    'next/link': linkMock, '@/components/app-shell': { AppShell: ({ children }) => React.createElement('main', null, children) },
    '@/components/manual-order-form': { ManualOrderForm: () => null },
    '@/components/order-table': { OrderFilters: () => React.createElement('form', { action: '/orders' }), OrderTable: ({ showDetails }) => { assert.equal(showDetails, true); return null; } },
    '@/lib/crm/data': { listOrdersPage: async options => { assert.equal(options.page, '2'); return { orders: [], total: 664, page: 2, pageSize: 50, pageCount: 14 }; } }
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ page: '2', q: 'Kit', source: 'woocommerce', status: 'new' }) }));
  assert.ok(html.includes('Showing 51–100 of 664 orders'));
  assert.ok(html.includes('q=Kit&amp;status=new&amp;source=woocommerce&amp;page=1'));
  assert.ok(html.includes('q=Kit&amp;status=new&amp;source=woocommerce&amp;page=3'));
  assert.match(html, /action="\/orders"/);
  assert.doesNotMatch(html, /name="page"/);
});
