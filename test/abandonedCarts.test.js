import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecoveryMatch, normalizePhone } from '../lib/crm/abandoned-cart-matching.js';
import {
  fetchAllWooCancelledCheckouts,
  normalizeWooCancelledCheckout
} from '../lib/crm/abandoned-carts.js';

const created = '2026-08-01T10:00:00.000Z';
const later = '2026-08-03T10:00:00.000Z';

test('matches a later paid order by Wix contact ID before any fallback', () => {
  const lead = { wix_created_at: created, email: 'customer@example.com', raw_data: { buyerInfo: { contactId: 'contact-1' } } };
  const orders = [{ id: 'wrong-email', source_created_at: later, customers: { wix_contact_id: 'other', email: 'customer@example.com' } }, { id: 'correct-contact', source_created_at: later, customers: { wix_contact_id: 'contact-1' } }];
  assert.deepEqual(findRecoveryMatch(lead, orders), { order: orders[1], method: 'wix_contact_id' });
});

test('uses normalized email then phone only when the cart has no Wix contact ID', () => {
  const emailLead = { wix_created_at: created, email: ' Customer@Example.com ', raw_data: {} };
  const emailOrder = { id: 'email-match', source_created_at: later, customers: { email: 'customer@example.com' } };
  assert.equal(findRecoveryMatch(emailLead, [emailOrder]).method, 'email');
  const phoneLead = { wix_created_at: created, phone: '+91 98765 43210', raw_data: {} };
  const phoneOrder = { id: 'phone-match', source_created_at: later, customers: { phone: '9876543210' } };
  assert.equal(findRecoveryMatch(phoneLead, [phoneOrder]).method, 'phone');
  assert.equal(normalizePhone('+91 98765 43210'), '9876543210');
});

test('does not match orders placed before the abandoned checkout', () => {
  const lead = { wix_created_at: created, email: 'customer@example.com', raw_data: {} };
  const order = { id: 'old-order', source_created_at: '2026-07-31T10:00:00.000Z', customers: { email: 'customer@example.com' } };
  assert.equal(findRecoveryMatch(lead, [order]), null);
});

test('normalizes a cancelled WooCommerce order into the shared Ops queue', () => {
  const lead = normalizeWooCancelledCheckout({
    id: 451,
    status: 'cancelled',
    date_created_gmt: '2026-10-08T05:30:00',
    date_modified_gmt: '2026-10-08T06:00:00',
    currency: 'INR',
    total: '14999.00',
    payment_url: 'https://shop.example/checkout/order-pay/451/',
    billing: { first_name: 'Asha', last_name: 'Rao', email: 'asha@example.com', phone: '+91 98765 43210' },
    line_items: [{ name: 'Scrambler 400 Cruise Control', quantity: 1 }]
  });
  assert.equal(lead.source, 'woocommerce');
  assert.equal(lead.external_checkout_id, '451');
  assert.equal(lead.wix_abandoned_checkout_id, null);
  assert.equal(lead.customer_name, 'Asha Rao');
  assert.equal(lead.cart_value, 14999);
  assert.equal(lead.wix_status, 'cancelled');
  assert.equal(lead.wix_created_at, '2026-10-08T05:30:00Z');
});

test('paginates cancelled WooCommerce orders and honors the configured cap', async () => {
  const calls = [];
  const result = await fetchAllWooCancelledCheckouts({
    woocommerce: {
      baseUrl: 'https://shop.example', consumerKey: 'ck', consumerSecret: 'cs',
      abandonedCheckoutSync: { enabled: true, pageSize: 2, maxPages: 2 }
    }
  }, {
    fetchWooCommerceCancelledOrders: async (_config, pageOptions) => {
      calls.push(pageOptions);
      return { orders: [{ id: pageOptions.page }], hasMore: true };
    }
  });
  assert.deepEqual(calls, [{ page: 1, perPage: 2 }, { page: 2, perPage: 2 }]);
  assert.equal(result.items.length, 2);
  assert.equal(result.stoppedByMaxPages, true);
});

test('matches a later purchase from the same WooCommerce contact as recovered', () => {
  const lead = normalizeWooCancelledCheckout({
    id: 451,
    date_created_gmt: '2026-10-08T05:30:00',
    billing: { email: ' Asha@Example.com ', phone: '+91 98765 43210' }
  });
  const paidOrder = {
    id: 'paid-order',
    source_created_at: '2026-10-08T07:00:00.000Z',
    customers: { email: 'asha@example.com', phone: '9876543210' }
  };
  assert.deepEqual(findRecoveryMatch(lead, [paidOrder]), { order: paidOrder, method: 'email' });
});
